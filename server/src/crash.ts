// Общий краш: один раунд, один таймер и одна точка взрыва для всех игроков.
// Сервер ведёт раунды сам: ждёт ставки, запускает полёт, взрывает на точке из сида раунда.
// Хеш сида виден до ставок, сам сид раскрывается после взрыва — исход нельзя подменить задним числом.
// Ставка и вывод проходят только через сервер, клиенты получают одинаковые снимки по живому каналу.
import { fromNano, toNano } from '@ton/core'
import { config } from './config.ts'
import { q, transaction } from './db.ts'
import { randomSeed, roundFloats, sha256Hex } from './fair.ts'
import { CRASH_GROWTH, crashMultiplierAt, crashPoint, crashTimeOf } from './gamemath.ts'
import { applyLedger, LedgerError, restoreWager, wagerLeft, type User } from './ledger.ts'
import { broadcast, onJoin, photoOf, publishWin } from './live.ts'

const WAIT_MS = 7000
const AFTER_MS = 3500
/** Ставки закрываются чуть раньше старта: так они успевают дойти до всех до взлёта. */
const BET_CLOSE_MS = 300
const TICK_MS = 50
const HISTORY_KEEP = 24
const MIN_BET = toNano('0.1')
const MAX_BET = toNano('1000')
/** Повторная отправка той же ставки (сеть, двойное нажатие) возвращает уже принятую. */
const KEY_RE = /^[A-Za-z0-9_-]{6,40}$/

type Phase = 'waiting' | 'flying' | 'crashed'

interface Bet {
  userId: number
  name: string
  amount: bigint
  auto: number | null
  cashed: number | null
  payout: bigint
  key: string | null
  at: number
  /** Сколько эта ставка закрыла в отыгрыше: при отмене это возвращается. */
  wager: bigint
}

interface Round {
  id: number
  hash: string
  seed: string
  point: number
  phase: Phase
  /** Время взлёта по часам сервера. */
  startAt: number
  crashedAt: number | null
  bets: Map<number, Bet>
}

interface Past {
  id: number
  point: number
  hash: string
  seed: string
}

let round: Round
let version = 0
const history: Past[] = []

export const pointOf = (seed: string) => crashPoint(roundFloats(seed, 1)[0])

const mulNano = (amount: bigint, mult: number) => (amount * BigInt(Math.round(mult * 100))) / 100n

// ---------- Снимок для игроков ----------

function snapshot() {
  const crashed = round.phase === 'crashed'
  return {
    t: 'crash',
    v: version,
    now: Date.now(),
    id: round.id,
    phase: round.phase,
    hash: round.hash,
    startAt: round.startAt,
    growth: CRASH_GROWTH,
    // Точка и сид раунда известны только после взрыва
    point: crashed ? round.point : null,
    seed: crashed ? round.seed : null,
    bets: [...round.bets.values()]
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.at - b.at))
      .map((b) => ({ uid: b.userId, name: b.name, photo: photoOf(b.userId), amount: fromNano(b.amount), auto: b.auto, cashed: b.cashed, payout: fromNano(b.payout) })),
    history,
  }
}

let pushTimer: NodeJS.Timeout | null = null

/** Рассылка снимка. Частые изменения (много ставок подряд) склеиваются в одно сообщение. */
function push(now = false) {
  version++
  if (now) {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = null
    broadcast(snapshot(), 'crash')
    return
  }
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = null
    broadcast(snapshot(), 'crash')
  }, 80)
}

// ---------- Ход раунда ----------

function newRound() {
  const seed = randomSeed()
  const hash = sha256Hex(seed)
  const id = Number(q('SELECT COALESCE(MAX(id), 1204000) + 1 AS id FROM crash_rounds').get()!.id)
  q('INSERT INTO crash_rounds (id, hash, seed, point, status) VALUES (?, ?, ?, ?, ?)').run(id, hash, seed, pointOf(seed), 'open')
  round = { id, hash, seed, point: pointOf(seed), phase: 'waiting', startAt: Date.now() + WAIT_MS, crashedAt: null, bets: new Map() }
  push(true)
  setTimeout(takeOff, WAIT_MS)
}

function takeOff() {
  round.phase = 'flying'
  round.startAt = Date.now()
  q('UPDATE crash_rounds SET started_at = ? WHERE id = ?').run(round.startAt, round.id)
  push(true)
  const timer = setInterval(() => {
    const elapsed = Date.now() - round.startAt
    if (elapsed >= crashTimeOf(round.point)) {
      clearInterval(timer)
      explode()
      return
    }
    const m = crashMultiplierAt(elapsed)
    for (const bet of round.bets.values()) {
      if (bet.cashed !== null) continue
      // Автовывод срабатывает ровно на заданном множителе, если раунд до него дожил
      if (bet.auto !== null && bet.auto <= m && bet.auto < round.point) settle(bet, bet.auto)
      // Потолок выплаты: забираем за игрока, когда выигрыш дошёл до предела
      else if (mulNano(bet.amount, m) >= config.maxWin) settle(bet, m)
    }
  }, TICK_MS)
}

function explode() {
  round.phase = 'crashed'
  round.crashedAt = Date.now()
  q("UPDATE crash_rounds SET crashed_at = ?, status = 'done' WHERE id = ?").run(round.crashedAt, round.id)
  history.unshift({ id: round.id, point: round.point, hash: round.hash, seed: round.seed })
  if (history.length > HISTORY_KEEP) history.pop()
  push(true)
  setTimeout(newRound, AFTER_MS)
}

/** Выплата по ставке на множителе mult. */
function settle(bet: Bet, mult: number): bigint {
  let payout = mulNano(bet.amount, mult)
  if (payout > config.maxWin) payout = config.maxWin
  const balance = transaction(() => {
    const b = applyLedger(bet.userId, 'win', payout, `crash:${round.id}`)
    q('UPDATE crash_bets SET cashed = ?, payout_nano = ? WHERE round_id = ? AND user_id = ?').run(mult, payout, round.id, bet.userId)
    return b
  })
  bet.cashed = mult
  bet.payout = payout
  publishWin({ name: bet.name, photo: photoOf(bet.userId) }, { game: 'crash', amount: fromNano(payout) })
  push()
  return balance
}

// ---------- Действия игрока ----------

function parseAuto(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Math.floor(Number(value) * 100) / 100
  if (!Number.isFinite(n) || n < 1.01 || n > 100000) throw new LedgerError('Автовывод — от x1.01')
  return n
}

export function placeCrashBet(user: User, amount: bigint, autoRaw: unknown, keyRaw: unknown) {
  const key = typeof keyRaw === 'string' && KEY_RE.test(keyRaw) ? keyRaw : null
  const existing = round.bets.get(user.id)
  if (existing) {
    // Тот же запрос пришёл ещё раз — отвечаем как в первый раз, второй раз не списываем
    if (key && existing.key === key) return { id: round.id, amount: fromNano(existing.amount), balance: fromNano(user.balance) }
    throw new LedgerError('Ставка в этом раунде уже сделана')
  }
  if (round.phase !== 'waiting' || Date.now() > round.startAt - BET_CLOSE_MS) throw new LedgerError('Ставки на этот раунд закрыты, дождитесь следующего')
  if (amount < MIN_BET) throw new LedgerError('Минимальная ставка 0.1 TON')
  if (amount > MAX_BET) throw new LedgerError('Слишком большая ставка')
  const auto = parseAuto(autoRaw)
  let wager = 0n
  const balance = transaction(() => {
    const before = wagerLeft(user.id)
    const b = applyLedger(user.id, 'bet', -amount, `crash:${round.id}`)
    wager = before - wagerLeft(user.id)
    q('INSERT INTO crash_bets (round_id, user_id, amount_nano, auto, wager_nano, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(round.id, user.id, amount, auto, wager, Date.now())
    return b
  })
  round.bets.set(user.id, { userId: user.id, name: user.name, amount, auto, cashed: null, payout: 0n, key, at: Date.now(), wager })
  push()
  return { id: round.id, amount: fromNano(amount), balance: fromNano(balance) }
}

export function cancelCrashBet(user: User) {
  const bet = round.bets.get(user.id)
  if (!bet) throw new LedgerError('Ставки нет')
  if (round.phase !== 'waiting' || Date.now() > round.startAt - BET_CLOSE_MS) throw new LedgerError('Раунд уже начался')
  const balance = transaction(() => {
    q('DELETE FROM crash_bets WHERE round_id = ? AND user_id = ?').run(round.id, user.id)
    restoreWager(user.id, bet.wager)
    return applyLedger(user.id, 'refund', bet.amount, `crash:${round.id}:cancel`)
  })
  round.bets.delete(user.id)
  push()
  return { balance: fromNano(balance) }
}

export function cashOutCrash(user: User) {
  const bet = round.bets.get(user.id)
  if (!bet) throw new LedgerError('Ставки нет')
  // Повторное нажатие после вывода: отвечаем тем же выводом
  if (bet.cashed !== null) return { cashed: bet.cashed, payout: fromNano(bet.payout), balance: fromNano(user.balance) }
  if (round.phase !== 'flying') throw new LedgerError('Раунд ещё не начался')
  const elapsed = Date.now() - round.startAt
  // Множитель берём по часам сервера в момент запроса. После точки взрыва вывод уже не принимается
  if (elapsed >= crashTimeOf(round.point)) throw new LedgerError('Не успели: ракета улетела')
  const mult = crashMultiplierAt(elapsed)
  const balance = settle(bet, mult)
  return { cashed: bet.cashed, payout: fromNano(bet.payout), balance: fromNano(balance) }
}

export const crashHistory = () => history

// ---------- Запуск ----------

/** После перезапуска сервера незавершённый раунд отменяется, не выведенные ставки возвращаются. */
function recover() {
  const open = q("SELECT id FROM crash_rounds WHERE status = 'open'").all()
  for (const r of open) {
    transaction(() => {
      const bets = q('SELECT user_id, amount_nano, wager_nano FROM crash_bets WHERE round_id = ? AND cashed IS NULL').all(r.id)
      for (const b of bets) {
        applyLedger(Number(b.user_id), 'refund', b.amount_nano as bigint, `crash:${r.id}:void`)
        restoreWager(Number(b.user_id), b.wager_nano as bigint)
      }
      q("UPDATE crash_rounds SET status = 'void' WHERE id = ?").run(r.id)
    })
  }
  const past = q("SELECT id, point, hash, seed FROM crash_rounds WHERE status = 'done' ORDER BY id DESC LIMIT ?").all(HISTORY_KEEP)
  history.push(...past.map((p) => ({ id: Number(p.id), point: Number(p.point), hash: String(p.hash), seed: String(p.seed) })))
}

export function startCrash() {
  recover()
  onJoin('crash', snapshot)
  newRound()
}
