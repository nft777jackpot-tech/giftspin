// Математика игр, общая с сайтом (webapp/src/lib/rtp.ts). Чистые функции без крипто.
// Множители подгоняются под RTP так же, как на клиенте, иначе исход сервера не совпал бы с проверкой.
import { config } from './config.ts'

const rtp = () => config.rtp

// ---------- Дайс ----------
export const DICE_MIN_CHANCE = 0.01
export const DICE_MAX_CHANCE = 0.95
export const diceRoll = (u: number) => Math.floor(u * 10000) / 100
export const diceMultiplier = (chance: number) => Math.floor((rtp() / chance) * 10000) / 10000
export function diceWin(roll: number, chance: number, over: boolean): boolean {
  const k = Math.round(roll * 100)
  const edge = Math.round(chance * 10000)
  return over ? k >= 10000 - edge : k < edge
}

// ---------- Плинко ----------
export const PLINKO_ROWS = [8, 12, 16] as const
export type PlinkoRows = (typeof PLINKO_ROWS)[number]
export type PlinkoRisk = 'low' | 'mid' | 'high'
export const PLINKO_MAX_MULT = 100

const PLINKO_SHAPE: Record<PlinkoRows, Record<PlinkoRisk, number[]>> = {
  8: { low: [0.5, 1, 1.2, 2, 5], mid: [0.4, 0.7, 1.4, 3.2, 12], high: [0.2, 0.4, 1.4, 4.5, 28] },
  12: { low: [0.5, 1, 1.1, 1.4, 1.8, 3.2, 9], mid: [0.3, 0.6, 1.1, 2, 4, 10, 30], high: [0.2, 0.2, 0.6, 2, 8, 25, 160] },
  16: {
    low: [0.5, 1, 1.1, 1.2, 1.4, 1.5, 2.2, 8, 15],
    mid: [0.3, 0.5, 1, 1.5, 3, 5, 11, 40, 100],
    high: [0.2, 0.2, 0.2, 2, 4, 9, 22, 45, 900],
  },
}

function binom(n: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}
export const plinkoProbs = (rows: number) => Array.from({ length: rows + 1 }, (_, k) => binom(rows, k) / 2 ** rows)

const floorNice = (v: number) => (v < 10 ? Math.floor(v * 100) / 100 : v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v))

export function plinkoMultipliers(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  const probs = plinkoProbs(rows)
  const half = PLINKO_SHAPE[rows][risk]
  const shape = probs.map((_, k) => half[Math.abs(k - rows / 2)])
  const ev = (s: number) => probs.reduce((acc, p, k) => acc + p * Math.min(PLINKO_MAX_MULT, shape[k] * s), 0)
  let lo = 0
  let hi = 1
  while (ev(hi) < rtp()) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (ev(mid) < rtp()) lo = mid
    else hi = mid
  }
  return shape.map((s) => floorNice(Math.min(PLINKO_MAX_MULT, s * lo)))
}

/** Путь шарика: на каждом ряду вправо, если u ≥ 0.5. */
export const plinkoPath = (floats: number[], rows: number) => floats.slice(0, rows).map((u) => u >= 0.5)

// ---------- Кейсы ----------
/** Шансы призов: подбираются так, чтобы средняя выдача была ровно RTP × цена кейса. Как на сайте. */
export function caseOdds(values: number[], price: number): number[] {
  const target = rtp() * price
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (target <= min || target >= max) throw new Error(`Case EV ${target} outside ${min}..${max}`)
  const xs = values.map((v) => v / target)
  const probsFor = (lambda: number) => {
    const logits = xs.map((x) => -lambda * x)
    const top = Math.max(...logits)
    const w = logits.map((l) => Math.exp(l - top))
    const sum = w.reduce((a, b) => a + b, 0)
    return w.map((x) => x / sum)
  }
  const ev = (lambda: number) => probsFor(lambda).reduce((acc, p, i) => acc + p * values[i], 0)
  let lo = -1
  let hi = 1
  while (ev(lo) < target) lo *= 2
  while (ev(hi) > target) hi *= 2
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (ev(mid) > target) lo = mid
    else hi = mid
  }
  return probsFor((lo + hi) / 2)
}

/** Индекс приза по числу u из [0, 1). */
export function pickIndex(probs: number[], u: number): number {
  let acc = 0
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i]
    if (u < acc) return i
  }
  return probs.length - 1
}

// ---------- Рулетка ----------
export type RouletteColor = 'red' | 'black' | 'green'
/** 15 ячеек: одна зелёная, по семь красных и чёрных через одну. */
export const ROULETTE_CELLS: RouletteColor[] = ['green', ...Array.from({ length: 14 }, (_, i): RouletteColor => (i % 2 === 0 ? 'red' : 'black'))]
export function rouletteMultiplier(color: RouletteColor): number {
  const p = ROULETTE_CELLS.filter((c) => c === color).length / ROULETTE_CELLS.length
  return Math.floor((rtp() / p) * 100) / 100
}
export const rouletteCell = (u: number) => Math.floor(u * ROULETTE_CELLS.length)
