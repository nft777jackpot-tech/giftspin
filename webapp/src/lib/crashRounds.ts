// Раунды краша. С сервером раунды общие и настоящие: их ведёт сервер, сюда приходят снимки.
// Без сервера (демо) раунды идут по общему расписанию: оно выводится из времени, поэтому у всех
// игроков в одну и ту же секунду один и тот же раунд, таймер и точка взрыва.
import { roundFloats, sha256Hex } from './fair'
import { crashPoint } from './rtp'

/** Рост множителя: m(t) = e^(GROWTH·t), t в мс. x2 примерно за 8.7 с. Тот же на сервере. */
export const GROWTH = 0.00008
export const WAIT_MS = 6000
export const AFTER_MS = 3200

export type CrashPhase = 'waiting' | 'flying' | 'crashed'

export interface PastRound {
  id: number
  point: number
  hash: string
  seed: string
}

export interface CrashBetView {
  uid: number
  name: string
  photo: string | null
  amount: string
  auto: number | null
  cashed: number | null
  payout: string
}

/** Состояние раунда одинаковой формы для сервера и демо. Время — по часам устройства. */
export interface CrashSnap {
  id: number
  phase: CrashPhase
  /** Время взлёта. */
  startAt: number
  /** Точка взрыва: в демо известна по расписанию, с сервера — только после взрыва. */
  point: number | null
  hash: string
  seed: string | null
  bets: CrashBetView[]
  history: PastRound[]
}

export function crashFromSeed(seed: string): number {
  return crashPoint(undefined, roundFloats(seed, 1)[0])
}

export const flightMs = (point: number) => Math.log(point) / GROWTH

// ---------- Демо-расписание ----------

const HOUR = 3_600_000
/** Потолок демо-раунда: так любой раунд укладывается в оставшиеся минуты часа. */
const DEMO_MAX = 1000

interface DemoRound extends PastRound {
  betAt: number
  startAt: number
  crashAt: number
  endAt: number
}

const hours = new Map<number, DemoRound[]>()

/**
 * Раунды одного часа: идут друг за другом от начала часа. Раунд, который не успевает закончиться
 * до конца часа, не начинается — следующий раунд ждёт начала нового часа.
 */
function hourRounds(h: number): DemoRound[] {
  const cached = hours.get(h)
  if (cached) return cached
  const list: DemoRound[] = []
  let t = h
  for (let k = 0; ; k++) {
    const seed = sha256Hex(`giftspin-crash:${h}:${k}`)
    const point = Math.min(DEMO_MAX, crashFromSeed(seed))
    const startAt = t + WAIT_MS
    const crashAt = startAt + flightMs(point)
    const endAt = crashAt + AFTER_MS
    if (endAt > h + HOUR) break
    list.push({ id: (h / HOUR) * 1000 + k, seed, hash: sha256Hex(seed), point, betAt: t, startAt, crashAt, endAt })
    t = endAt
  }
  if (hours.size > 4) hours.delete(hours.keys().next().value!)
  hours.set(h, list)
  return list
}

/** Демо-раунд на момент now и прошлые раунды для истории. */
export function demoSnap(now = Date.now()): CrashSnap {
  const h = Math.floor(now / HOUR) * HOUR
  const list = hourRounds(h)
  let i = list.findIndex((r) => now < r.endAt)
  // Хвост часа после последнего раунда: идёт приём ставок на первый раунд следующего часа
  let cur: DemoRound
  if (i < 0) {
    cur = hourRounds(h + HOUR)[0]
    i = list.length
  } else cur = list[i]
  const before = [...hourRounds(h - HOUR), ...list.slice(0, i)].slice(-24).reverse()
  const phase: CrashPhase = now < cur.startAt ? 'waiting' : now < cur.crashAt ? 'flying' : 'crashed'
  // Как у сервера: взорвавшийся раунд сразу попадает в историю
  const past = phase === 'crashed' ? [cur, ...before].slice(0, 24) : before
  return {
    id: cur.id,
    phase,
    startAt: cur.startAt,
    point: cur.point,
    hash: cur.hash,
    seed: phase === 'crashed' ? cur.seed : null,
    bets: [],
    history: past.map(({ id, point, hash, seed }) => ({ id, point, hash, seed })),
  }
}
