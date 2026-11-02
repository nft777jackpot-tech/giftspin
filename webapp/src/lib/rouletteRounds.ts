// Раунды рулетки. С сервером раунды общие и настоящие, сюда приходят их снимки. Без сервера (демо)
// раунды идут по общему расписанию от времени: у всех в одну секунду один раунд и одна ячейка.
import { roundFloats, sha256Hex } from './fair'
import { rouletteCell, type RouletteColor } from './rtp'

export const BET_MS = 10_000
export const SPIN_MS = 5_400
export const RESULT_MS = 3_000
/** Раунд — интервал фиксированной длины, его номер — номер интервала. Так же считает сервер. */
export const SLOT = BET_MS + SPIN_MS + RESULT_MS

export type RoulettePhase = 'betting' | 'spinning' | 'result'

export interface RouletteBetView {
  uid: number
  name: string
  photo: string | null
  color: RouletteColor
  amount: string
  payout: string
}

export interface PastSpin {
  id: number
  cell: number
  hash: string
  seed: string
}

export interface RouletteSnap {
  id: number
  /** Начало приёма ставок по часам устройства. */
  startAt: number
  hash: string
  /** Ячейка раунда: известна, когда ставки закрыты. */
  cell: number | null
  seed: string | null
  bets: RouletteBetView[]
  history: PastSpin[]
}

export const cellFromSeed = (seed: string) => rouletteCell(roundFloats(seed, 1)[0])

export function phaseAt(startAt: number, now = Date.now()): RoulettePhase {
  const t = now - startAt
  return t < BET_MS ? 'betting' : t < BET_MS + SPIN_MS ? 'spinning' : 'result'
}

const spins = new Map<number, PastSpin>()

function demoSpin(id: number): PastSpin {
  let spin = spins.get(id)
  if (!spin) {
    const seed = sha256Hex(`giftspin-roulette:${id}`)
    spin = { id, cell: cellFromSeed(seed), hash: sha256Hex(seed), seed }
    spins.set(id, spin)
    if (spins.size > 60) spins.delete(spins.keys().next().value!)
  }
  return spin
}

/** Демо-раунд на момент now. Ячейка открывается, когда ставки закрыты, как у сервера. */
export function demoRouletteSnap(now = Date.now()): RouletteSnap {
  const id = Math.floor(now / SLOT)
  const startAt = id * SLOT
  const cur = demoSpin(id)
  const open = phaseAt(startAt, now) !== 'betting'
  const history = Array.from({ length: 20 }, (_, i) => demoSpin(id - 1 - i))
  if (phaseAt(startAt, now) === 'result') history.unshift(cur)
  return { id, startAt, hash: cur.hash, cell: open ? cur.cell : null, seed: open ? cur.seed : null, bets: [], history: history.slice(0, 20) }
}
