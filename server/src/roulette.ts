// Общая рулетка: один раунд и один таймер для всех игроков. Раунды идут без пауз по часам сервера:
// 10 с приём ставок, 5.4 с прокрутка, 3 с результат. Хеш сида раунда виден во время ставок,
// ячейка и сам сид открываются, когда ставки закрыты. Выплата — когда лента остановилась.
import { fromNano, toNano } from '@ton/core'
import { config } from './config.ts'
import { q, transaction } from './db.ts'
import { randomSeed, roundFloats, sha256Hex } from './fair.ts'
import { ROULETTE_CELLS, rouletteCell, rouletteMultiplier, type RouletteColor } from './gamemath.ts'
import { applyLedger, LedgerError, type User } from './ledger.ts'
import { broadcast, onJoin, photoOf, publishUserWin } from './live.ts'

export const ROULETTE_BET_MS = 10_000
export const ROULETTE_SPIN_MS = 5_400
export const ROULETTE_RESULT_MS = 3_000
const SLOT = ROULETTE_BET_MS + ROULETTE_SPIN_MS + ROULETTE_RESULT_MS
/** Ставки закрываются чуть раньше прокрутки: так они успевают дойти до всех. */
const BET_CLOSE_MS = 300
const HISTORY_KEEP = 20
const MIN_BET = toNano('0.1')
const MAX_BET = toNano('1000')
const KEY_RE = /^[A-Za-z0-9_-]{6,40}$/
const COLORS: RouletteColor[] = ['red', 'green', 'black']

type Phase = 'betting' | 'spinning' | 'result'

interface Bet {
  userId: number
  name: string
  color: RouletteColor
  amount: bigint
  payout: bigint
}

interface Round {
  id: number
  hash: string
  seed: string
  cell: number
  phase: Phase
  /** Начало раунда (приём ставок) по часам сервера. */
  startAt: number
  bets: Map<string, Bet>
  /** Ключи уже принятых ставок: повтор того же запроса не спишет второй раз. */
  keys: Map<string, string>
}

let round: Round
const history: { id: number; cell: number; hash: string; seed: string }[] = []

export const cellOf = (seed: string) => rouletteCell(roundFloats(seed, 1)[0])

function snapshot() {
  const open = round.phase !== 'betting'
  return {
    t: 'roulette',
    now: Date.now(),
    id: round.id,
    phase: round.phase,
    startAt: round.startAt,
    hash: round.hash,
    // Ячейка и сид известны всем, как только ставки закрыты
    cell: open ? round.cell : null,
    seed: open ? round.seed : null,
    bets: [...round.bets.values()]
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
      .map((b) => ({ uid: b.userId, name: b.name, photo: photoOf(b.userId), color: b.color, amount: fromNano(b.amount), payout: fromNano(b.payout) })),
    history,
  }
}

let pushTimer: NodeJS.Timeout | null = null
function push(now = false) {
  if (now) {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = null
    broadcast(snapshot(), 'roulette')
    return
  }
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = null
    broadcast(snapshot(), 'roulette')
  }, 80)
}

/** Ставить следующий шаг на границу фазы по часам сервера, а не через фиксированную паузу: так раунды не уплывают. */
const at = (time: number, fn: () => void) => setTimeout(fn, Math.max(0, time - Date.now()))

function newRound() {
  // Номер раунда — номер интервала по часам сервера; таймер может сработать на миллисекунду раньше
  const id = Math.max((round?.id ?? 0) + 1, Math.floor(Date.now() / SLOT))
  const startAt = id * SLOT
  const seed = randomSeed()
  const hash = sha256Hex(seed)
  const cell = cellOf(seed)
  q('INSERT INTO roulette_rounds (id, hash, seed, cell, status) VALUES (?, ?, ?, ?, ?)').run(id, hash, seed, cell, 'open')
  round = { id, hash, seed, cell, phase: 'betting', startAt, bets: new Map(), keys: new Map() }
  push(true)
  at(startAt + ROULETTE_BET_MS, spin)
}

function spin() {
  round.phase = 'spinning'
  push(true)
  at(round.startAt + ROULETTE_BET_MS + ROULETTE_SPIN_MS, settle)
}

function settle() {
  round.phase = 'result'
  const color = ROULETTE_CELLS[round.cell]
  const mult = rouletteMultiplier(color)
  transaction(() => {
    for (const bet of round.bets.values()) {
      if (bet.color !== color) continue
      let payout = (bet.amount * BigInt(Math.round(mult * 100))) / 100n
      if (payout > config.maxWin) payout = config.maxWin
      bet.payout = payout
      applyLedger(bet.userId, 'win', payout, `roulette:${round.id}`)
      q('UPDATE roulette_bets SET payout_nano = ? WHERE round_id = ? AND user_id = ? AND color = ?').run(payout, round.id, bet.userId, bet.color)
    }
    q("UPDATE roulette_rounds SET status = 'done' WHERE id = ?").run(round.id)
  })
  for (const bet of round.bets.values()) if (bet.payout > 0n) publishUserWin(bet.userId, { game: 'roulette', amount: fromNano(bet.payout) })
  history.unshift({ id: round.id, cell: round.cell, hash: round.hash, seed: round.seed })
  if (history.length > HISTORY_KEEP) history.pop()
  push(true)
  at(round.startAt + SLOT, newRound)
}

export function placeRouletteBet(user: User, colorRaw: unknown, amount: bigint, keyRaw: unknown) {
  const color = String(colorRaw) as RouletteColor
  if (!COLORS.includes(color)) throw new LedgerError('Нет такого цвета')
  const key = typeof keyRaw === 'string' && KEY_RE.test(keyRaw) ? keyRaw : null
  // Тот же запрос пришёл повторно (сеть, двойное нажатие) — второй раз не списываем
  if (key && round.keys.has(key)) return { id: round.id, balance: fromNano(user.balance), duplicate: true }
  if (round.phase !== 'betting' || Date.now() > round.startAt + ROULETTE_BET_MS - BET_CLOSE_MS) throw new LedgerError('Ставки на этот раунд закрыты')
  if (amount < MIN_BET) throw new LedgerError('Минимальная ставка 0.1 TON')
  const slot = `${user.id}:${color}`
  const before = round.bets.get(slot)?.amount ?? 0n
  if (before + amount > MAX_BET) throw new LedgerError('Слишком большая ставка')
  const balance = transaction(() => {
    const b = applyLedger(user.id, 'bet', -amount, `roulette:${round.id}`)
    q(
      'INSERT INTO roulette_bets (round_id, user_id, color, amount_nano, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (round_id, user_id, color) DO UPDATE SET amount_nano = amount_nano + excluded.amount_nano',
    ).run(round.id, user.id, color, amount, Date.now())
    return b
  })
  round.bets.set(slot, { userId: user.id, name: user.name, color, amount: before + amount, payout: 0n })
  if (key) round.keys.set(key, slot)
  push()
  return { id: round.id, balance: fromNano(balance) }
}

export const rouletteHistory = () => history

/** После перезапуска незавершённые раунды отменяются, ставки возвращаются. */
function recover() {
  for (const r of q("SELECT id FROM roulette_rounds WHERE status = 'open'").all()) {
    transaction(() => {
      for (const b of q('SELECT user_id, amount_nano FROM roulette_bets WHERE round_id = ?').all(r.id)) {
        applyLedger(Number(b.user_id), 'refund', b.amount_nano as bigint, `roulette:${r.id}:void`)
      }
      q("UPDATE roulette_rounds SET status = 'void' WHERE id = ?").run(r.id)
    })
  }
  const past = q("SELECT id, cell, hash, seed FROM roulette_rounds WHERE status = 'done' ORDER BY id DESC LIMIT ?").all(HISTORY_KEEP)
  history.push(...past.map((p) => ({ id: Number(p.id), cell: Number(p.cell), hash: String(p.hash), seed: String(p.seed) })))
}

export function startRoulette() {
  recover()
  onJoin('roulette', snapshot)
  // Раунд с этим номером уже был до перезапуска: номер не переигрываем, его сид уже раскрыт.
  // До конца интервала показываем его итог, следующий раунд — по общему таймеру
  const id = Math.floor(Date.now() / SLOT)
  const played = q('SELECT hash, seed, cell FROM roulette_rounds WHERE id = ?').get(id)
  if (played) {
    round = { id, hash: String(played.hash), seed: String(played.seed), cell: Number(played.cell), phase: 'result', startAt: id * SLOT, bets: new Map(), keys: new Map() }
    at((id + 1) * SLOT, newRound)
  } else newRound()
}
