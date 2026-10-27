// Игры на сервере: сервер сам принимает ставку, считает исход честной схемой и меняет баланс.
// Клиент только показывает результат и не может его подделать. Сейчас так работает дайс — образец для остальных.
import { fromNano, toNano } from '@ton/core'
import { config } from './config.ts'
import { q, transaction, type Row } from './db.ts'
import { fairFloats, randomSeed, sha256Hex } from './fair.ts'
import { applyLedger, LedgerError } from './ledger.ts'

/** Игры, которые считает сервер. Остальные пока на клиенте (только testnet), см. TRUST_CLIENT_GAMES. */
export const SERVER_GAMES = ['dice'] as const

const MAX_BET = toNano('1000')
const REVEALED_KEEP = 20

export interface SeedInfo {
  hash: string
  clientSeed: string
  nonce: number
}

const toSeed = (r: Row): SeedInfo => ({ hash: String(r.server_hash), clientSeed: String(r.client_seed), nonce: Number(r.nonce) })

function seedRow(userId: number): Row | undefined {
  return q('SELECT * FROM game_seeds WHERE user_id = ?').get(userId)
}

/** Текущая пара сидов игрока, создаётся при первом обращении. */
export function ensureSeeds(userId: number): SeedInfo {
  const existing = seedRow(userId)
  if (existing) return toSeed(existing)
  const serverSeed = randomSeed()
  q('INSERT OR IGNORE INTO game_seeds (user_id, server_seed, server_hash, client_seed, nonce) VALUES (?, ?, ?, ?, 0)').run(
    userId,
    serverSeed,
    sha256Hex(serverSeed),
    randomSeed(8),
  )
  return toSeed(seedRow(userId)!)
}

/** Недавно раскрытые пары этого игрока: по ним он проверяет прошлые ставки. */
export function revealedSeeds(userId: number) {
  return q('SELECT server_hash, server_seed, client_seed, nonce FROM revealed_seeds WHERE user_id = ? ORDER BY revealed_at DESC LIMIT ?').all(userId, REVEALED_KEEP)
}

/** Смена пары: старый серверный сид раскрывается (теперь его можно проверить), выдаётся новый. */
export function rotateSeeds(userId: number, clientSeed?: string): SeedInfo {
  return transaction(() => {
    const prev = seedRow(userId)
    if (prev) {
      q('INSERT OR REPLACE INTO revealed_seeds (server_hash, server_seed, client_seed, nonce, user_id, revealed_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        prev.server_hash,
        prev.server_seed,
        prev.client_seed,
        prev.nonce,
        userId,
        Date.now(),
      )
    }
    const serverSeed = randomSeed()
    const nextClient = (clientSeed?.trim() || (prev ? String(prev.client_seed) : randomSeed(8))).slice(0, 64)
    q('INSERT OR REPLACE INTO game_seeds (user_id, server_seed, server_hash, client_seed, nonce) VALUES (?, ?, ?, ?, 0)').run(userId, serverSeed, sha256Hex(serverSeed), nextClient)
    return toSeed(seedRow(userId)!)
  })
}

// ---------- Дайс ----------

const DICE_MIN_CHANCE = 0.01
const DICE_MAX_CHANCE = 0.95

/** Множитель при шансе chance: как на сайте, floor до 4 знаков. */
const diceMultiplier = (chance: number) => Math.floor((config.rtp / chance) * 10000) / 10000

export interface DiceResult {
  roll: number
  win: boolean
  multiplier: number
  payout: string
  balance: string
  /** Доказательство: по хешу, клиентскому сиду и номеру ставки исход проверяется после раскрытия пары. */
  proof: { hash: string; clientSeed: string; nonce: number }
}

/**
 * Один бросок. Внутри одной транзакции: списание ставки, расчёт исхода из сидов, рост номера ставки и
 * (при выигрыше) зачисление. Баланс не может уйти в минус — это проверяет база.
 */
export function playDice(userId: number, betNano: bigint, chance: number, over: boolean): DiceResult {
  if (betNano <= 0n || betNano > MAX_BET) throw new LedgerError('Неверная ставка')
  if (!(chance >= DICE_MIN_CHANCE && chance <= DICE_MAX_CHANCE)) throw new LedgerError('Неверный шанс')
  const mult = diceMultiplier(chance)
  ensureSeeds(userId)
  return transaction(() => {
    const r = seedRow(userId)!
    const nonce = Number(r.nonce)
    applyLedger(userId, 'bet', -betNano, `dice:${nonce}`)
    const [u] = fairFloats(String(r.server_seed), String(r.client_seed), nonce, 1)
    const roll = Math.floor(u * 10000) / 100
    const k = Math.round(roll * 100)
    const edge = Math.round(chance * 10000)
    const win = over ? k >= 10000 - edge : k < edge
    q('UPDATE game_seeds SET nonce = nonce + 1 WHERE user_id = ?').run(userId)

    let payout = 0n
    let balance = (q('SELECT balance_nano FROM users WHERE id = ?').get(userId)!.balance_nano as bigint)
    if (win) {
      payout = (betNano * BigInt(Math.round(mult * 10000))) / 10000n
      balance = applyLedger(userId, 'win', payout, `dice:${nonce}`)
    }
    return {
      roll,
      win,
      multiplier: mult,
      payout: fromNano(payout),
      balance: fromNano(balance),
      proof: { hash: String(r.server_hash), clientSeed: String(r.client_seed), nonce },
    }
  })
}
