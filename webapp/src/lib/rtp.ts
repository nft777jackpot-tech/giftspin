// Математика игр. Сейчас исход считается на клиенте для демо, в бою эти же
// формулы живут на сервере, а клиент только проигрывает анимацию.
import { RTP } from '../config'

/**
 * Шансы предметов кейса, при которых средний выигрыш равен rtp × price.
 * Вероятность падает экспоненциально с ценой предмета: p_i ∝ exp(-λ·v_i/target),
 * λ подбирается бисекцией.
 */
export function caseOdds(values: number[], price: number, rtp = RTP): number[] {
  const target = rtp * price
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (target <= min || target >= max) {
    throw new Error(`Case EV ${target} is outside item range ${min}..${max}`)
  }
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

/** Выбор индекса по вероятностям. u — равномерное число из [0, 1). */
export function pickIndex(probs: number[], u = Math.random()): number {
  let acc = 0
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i]
    if (u < acc) return i
  }
  return probs.length - 1
}

export const UPGRADE_MAX_CHANCE = 0.75

/** Апгрейд: средний возврат chance × target = rtp × stake. */
export function upgradeChance(stake: number, target: number, rtp = RTP): number {
  if (stake <= 0 || target <= 0) return 0
  return Math.min(UPGRADE_MAX_CHANCE, (rtp * stake) / target)
}

/** Краш: P(точка ≥ m) = rtp / m, поэтому забор на любом множителе даёт RTP. */
export function crashPoint(rtp = RTP, u = Math.random()): number {
  const uniform = 1 - u // (0, 1]
  return Math.max(1, Math.floor((rtp / uniform) * 100) / 100)
}

export type RouletteColor = 'red' | 'black' | 'green'

/** 15 ячеек: одна зелёная, по семь красных и чёрных через одну. */
export const ROULETTE_CELLS: RouletteColor[] = [
  'green',
  ...Array.from({ length: 14 }, (_, i): RouletteColor => (i % 2 === 0 ? 'red' : 'black')),
]

export function rouletteMultiplier(color: RouletteColor, rtp = RTP): number {
  const count = ROULETTE_CELLS.filter((c) => c === color).length
  const p = count / ROULETTE_CELLS.length
  return Math.floor((rtp / p) * 100) / 100
}

/** PvP-джекпот: победитель забирает банк за вычетом комиссии. */
export function jackpotPayout(pot: number, rtp = RTP): number {
  return pot * rtp
}

/** Рулетка: ячейка из числа u ∈ [0, 1). */
export function rouletteCell(u: number): number {
  return Math.floor(u * ROULETTE_CELLS.length)
}

// ---------- Дайс ----------

export const DICE_MIN_CHANCE = 0.01
export const DICE_MAX_CHANCE = 0.95

/** Бросок от 0.00 до 99.99: 10 000 равновероятных значений. */
export function diceRoll(u: number): number {
  return Math.floor(u * 10000) / 100
}

/** Выигрыш при шансе chance: «меньше» — бросок ниже порога, «больше» — не ниже 100 − порог. */
export function diceWin(roll: number, chance: number, over: boolean): boolean {
  const k = Math.round(roll * 100)
  const edge = Math.round(chance * 10000)
  return over ? k >= 10000 - edge : k < edge
}

export function diceMultiplier(chance: number, rtp = RTP): number {
  return Math.floor((rtp / chance) * 10000) / 10000
}

// ---------- Мины ----------

export const MINES_CELLS = 25

/** Вероятность открыть opened безопасных клеток подряд при mines минах. */
function minesSurvival(mines: number, opened: number): number {
  let p = 1
  for (let i = 0; i < opened; i++) p *= (MINES_CELLS - mines - i) / (MINES_CELLS - i)
  return p
}

/** Множитель после opened безопасных клеток: RTP ÷ вероятность дойти до них. */
export function minesMultiplier(mines: number, opened: number, rtp = RTP): number {
  if (opened <= 0) return 1
  return Math.floor((rtp / minesSurvival(mines, opened)) * 100) / 100
}

/** Расстановка мин: перемешивание Фишера — Йейтса на 24 числах, первые mines клеток — мины. */
export function minesLayout(floats: number[], mines: number): number[] {
  const cells = Array.from({ length: MINES_CELLS }, (_, i) => i)
  for (let i = MINES_CELLS - 1, k = 0; i > 0; i--, k++) {
    const j = Math.floor(floats[k] * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  return cells.slice(0, mines).sort((a, b) => a - b)
}

// ---------- Плинко ----------

export type PlinkoRisk = 'low' | 'mid' | 'high'
export const PLINKO_ROWS = [8, 12, 16] as const
export type PlinkoRows = (typeof PLINKO_ROWS)[number]

// Форма таблицы от центра к краю. Масштаб подгоняется под RTP в plinkoMultipliers
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

export function plinkoProbs(rows: number): number[] {
  return Array.from({ length: rows + 1 }, (_, k) => binom(rows, k) / 2 ** rows)
}

// Округление вниз, поэтому фактический RTP чуть ниже заданного, но не выше
const floorNice = (v: number) => (v < 10 ? Math.floor(v * 100) / 100 : v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v))

/** Потолок множителя лунки. */
export const PLINKO_MAX_MULT = 100

/**
 * Масштаб s подбирается бисекцией так, чтобы средний возврат с учётом потолка был ровно RTP:
 * обрезанные края отдают свою долю остальным лункам, и они становятся чуть щедрее.
 */
export function plinkoMultipliers(rows: PlinkoRows, risk: PlinkoRisk, rtp = RTP): number[] {
  const probs = plinkoProbs(rows)
  const half = PLINKO_SHAPE[rows][risk]
  const shape = probs.map((_, k) => half[Math.abs(k - rows / 2)])
  const ev = (s: number) => probs.reduce((acc, p, k) => acc + p * Math.min(PLINKO_MAX_MULT, shape[k] * s), 0)
  let lo = 0
  let hi = 1
  while (ev(hi) < rtp) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (ev(mid) < rtp) lo = mid
    else hi = mid
  }
  return shape.map((s) => floorNice(Math.min(PLINKO_MAX_MULT, s * lo)))
}

/** Путь шарика: на каждом ряду вправо, если u ≥ 0.5. Лунка — число шагов вправо. */
export function plinkoPath(floats: number[], rows: number): boolean[] {
  return floats.slice(0, rows).map((u) => u >= 0.5)
}

// ---------- Коинфлип ----------

export type CoinSide = 'ton' | 'star'

export function coinSide(u: number): CoinSide {
  return u < 0.5 ? 'ton' : 'star'
}

/**
 * Взнос за игру подарками: победитель забирает оба подарка, поэтому комиссия берётся
 * с баланса при входе. Ставка V + взнос V·(1/RTP − 1) в среднем возвращает V, это и есть RTP.
 */
export function giftFlipFee(value: number, rtp = RTP): number {
  return Math.ceil(value * (1 / rtp - 1) * 100) / 100
}

// ---------- Контракты ----------

export const CONTRACT_MIN = 3
export const CONTRACT_MAX = 10

/**
 * Подарки, которые может дать контракт на сумму total, и их шансы так, чтобы средняя
 * стоимость выпадения была RTP × total. Пусто, если подходящих подарков нет.
 */
export function contractPool<G extends { price: number }>(total: number, gifts: G[], rtp = RTP): { gift: G; chance: number }[] {
  const target = rtp * total
  const pool = gifts.filter((g) => g.price >= total * 0.2 && g.price <= total * 6).sort((a, b) => a.price - b.price)
  if (pool.length < 2 || pool[0].price >= target || pool[pool.length - 1].price <= target) return []
  const odds = caseOdds(
    pool.map((g) => g.price),
    total,
    rtp,
  )
  return pool.map((gift, i) => ({ gift, chance: odds[i] }))
}

// ---------- PvP ----------

/** Победитель по доле вклада: u × банк попадает в отрезок одного из участников. */
export function pickByWeight(weights: number[], u: number): number {
  const total = weights.reduce((a, b) => a + b, 0)
  let acc = 0
  const point = u * total
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (point < acc) return i
  }
  return weights.length - 1
}
