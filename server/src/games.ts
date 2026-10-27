// Игры на сервере: сервер сам принимает ставку, считает исход честной схемой и меняет баланс.
// Клиент только показывает результат и не может его подделать. Сейчас так работает дайс — образец для остальных.
import { fromNano, toNano } from '@ton/core'
import { q, transaction, type Row } from './db.ts'
import { fairFloats, randomSeed, sha256Hex } from './fair.ts'
import { DICE_MAX_CHANCE, DICE_MIN_CHANCE, diceMultiplier, diceRoll, diceWin, PLINKO_ROWS, plinkoMultipliers, plinkoPath, type PlinkoRisk, type PlinkoRows } from './gamemath.ts'
import { applyLedger, LedgerError } from './ledger.ts'

/** Игры, которые считает сервер. Остальные пока на клиенте (только testnet), см. TRUST_CLIENT_GAMES. */
export const SERVER_GAMES = ['dice', 'plinko'] as const

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

// ---------- Движок одиночных игр ----------
// Общий ход: списать ставку, взять числа из запечатанного сида, посчитать множитель, зачислить выигрыш.
// Исход берётся из серверного сида, поэтому клиент его не задаёт и не подделает.

export interface PlayResult {
  multiplier: number
  payout: string
  balance: string
  /** Короткая запись исхода для журнала проверки. */
  result: string
  win: boolean
  proof: { hash: string; clientSeed: string; nonce: number }
  [field: string]: unknown
}

interface Computed {
  multiplier: number
  result: string
  win: boolean
  /** Поля, нужные сайту для анимации, например путь шарика в плинко. */
  extra?: Record<string, unknown>
}

function resolve(userId: number, kind: string, betNano: bigint, floatCount: number, compute: (floats: number[]) => Computed): PlayResult {
  if (betNano <= 0n || betNano > MAX_BET) throw new LedgerError('Неверная ставка')
  ensureSeeds(userId)
  return transaction(() => {
    const r = seedRow(userId)!
    const nonce = Number(r.nonce)
    applyLedger(userId, 'bet', -betNano, `${kind}:${nonce}`)
    const floats = fairFloats(String(r.server_seed), String(r.client_seed), nonce, floatCount)
    const c = compute(floats)
    q('UPDATE game_seeds SET nonce = nonce + 1 WHERE user_id = ?').run(userId)

    let payout = 0n
    let balance = q('SELECT balance_nano FROM users WHERE id = ?').get(userId)!.balance_nano as bigint
    if (c.multiplier > 0) {
      payout = (betNano * BigInt(Math.round(c.multiplier * 10000))) / 10000n
      if (payout > 0n) balance = applyLedger(userId, 'win', payout, `${kind}:${nonce}`)
    }
    return {
      multiplier: c.multiplier,
      payout: fromNano(payout),
      balance: fromNano(balance),
      result: c.result,
      win: c.win,
      proof: { hash: String(r.server_hash), clientSeed: String(r.client_seed), nonce },
      ...(c.extra ?? {}),
    }
  })
}

/** Дайс: бросок 0.00–99.99, выигрыш при попадании в выбранный диапазон. */
export function playDice(userId: number, betNano: bigint, chance: number, over: boolean): PlayResult {
  if (!(chance >= DICE_MIN_CHANCE && chance <= DICE_MAX_CHANCE)) throw new LedgerError('Неверный шанс')
  const mult = diceMultiplier(chance)
  return resolve(userId, 'dice', betNano, 1, ([u]) => {
    const roll = diceRoll(u)
    const win = diceWin(roll, chance, over)
    return { multiplier: win ? mult : 0, result: roll.toFixed(2), win, extra: { roll } }
  })
}

/** Плинко: шарик идёт по рядам, лунка задаёт множитель. Путь возвращается для анимации. */
export function playPlinko(userId: number, betNano: bigint, rows: PlinkoRows, risk: PlinkoRisk): PlayResult {
  if (!(PLINKO_ROWS as readonly number[]).includes(rows)) throw new LedgerError('Неверное число рядов')
  if (!['low', 'mid', 'high'].includes(risk)) throw new LedgerError('Неверный риск')
  const mults = plinkoMultipliers(rows, risk)
  return resolve(userId, 'plinko', betNano, rows, (floats) => {
    const path = plinkoPath(floats, rows)
    const slot = path.filter(Boolean).length
    const mult = mults[slot]
    return { multiplier: mult, result: `x${mult}`, win: mult >= 1, extra: { path, slot } }
  })
}
