// Пересчёт исхода по раскрытым сидам. Те же формулы, что в играх, поэтому результат обязан совпасть
import type { CaseDef } from '../data/cases'
import { getGift, giftCatalog } from '../data/gifts'
import { fairFloats, roundFloats, sha256Hex } from './fair'
import { fmtMult } from './format'
import { t, tk } from './i18n'
import {
  coinSide,
  contractPool,
  crashPoint,
  diceRoll,
  diceWin,
  minesLayout,
  pickByWeight,
  pickIndex,
  plinkoMultipliers,
  plinkoPath,
  rouletteCell,
  ROULETTE_CELLS,
  type PlinkoRisk,
  type PlinkoRows,
} from './rtp'

export type GameId = 'case' | 'upgrade' | 'dice' | 'mines' | 'plinko' | 'contract' | 'battle' | 'coinflip' | 'crash' | 'roulette' | 'jackpot'

export const GAME_NAMES: Record<GameId, string> = {
  case: tk('Кейсы'),
  upgrade: tk('Апгрейд'),
  dice: tk('Дайс'),
  mines: tk('Мины'),
  plinko: tk('Плинко'),
  contract: tk('Контракты'),
  battle: tk('Кейс-батлы'),
  coinflip: tk('Коинфлип'),
  crash: tk('Краш'),
  roulette: tk('Рулетка'),
  jackpot: tk('PvP-джекпот'),
}

/** Игры на личной паре сидов и игры с общим сидом раунда. */
export const PERSONAL_GAMES: GameId[] = ['case', 'upgrade', 'dice', 'mines', 'plinko', 'contract', 'roulette']
export const ROUND_GAMES: GameId[] = ['crash', 'coinflip', 'battle', 'jackpot']

export interface VerifyInput {
  game: GameId
  serverSeed?: string
  clientSeed?: string
  nonce?: number
  /** Сид общего раунда. */
  seed?: string
  params?: Record<string, string | number>
}

export interface VerifyResult {
  /** SHA-256 сида: должен совпасть с хешем, показанным до игры. */
  hash: string
  lines: [string, string][]
}

const ROULETTE_LABEL = { red: tk('Красное'), black: tk('Чёрное'), green: tk('Зелёное') }
const pct = (u: number) => `${(u * 100).toFixed(4)}%`

export function verifyRound(input: VerifyInput, cases: CaseDef[]): VerifyResult | string {
  const { game, params = {} } = input
  const personal = PERSONAL_GAMES.includes(game)
  const seed = (personal ? input.serverSeed : input.seed)?.trim()
  if (!seed) return t('Введите сид')
  const floats = (n: number) =>
    personal ? fairFloats(seed, (input.clientSeed ?? '').trim(), Number(input.nonce ?? 0), n) : roundFloats(seed, n)
  const lines: [string, string][] = []

  switch (game) {
    case 'case': {
      const c = cases.find((x) => x.id === params.caseId)
      if (!c) return t('Выберите кейс')
      const [u] = floats(1)
      const item = c.items[pickIndex(c.items.map((i) => i.chance), u)]
      lines.push([t('Число'), u.toFixed(8)], [t('Выпал подарок'), getGift(item.giftId).name])
      break
    }
    case 'upgrade': {
      const chance = Number(params.chance)
      const [u] = floats(1)
      lines.push([t('Стрелка'), pct(u)], [t('Шанс'), pct(chance)], [t('Итог'), u < chance ? t('Выигрыш') : t('Проигрыш')])
      break
    }
    case 'dice': {
      const [u] = floats(1)
      const roll = diceRoll(u)
      lines.push([t('Бросок'), roll.toFixed(2)])
      if (params.chance) {
        const win = diceWin(roll, Number(params.chance), params.over === 1 || params.over === '1')
        lines.push([t('Итог'), win ? t('Выигрыш') : t('Проигрыш')])
      }
      break
    }
    case 'mines': {
      const mines = Math.min(24, Math.max(1, Number(params.mines) || 3))
      const layout = minesLayout(floats(24), mines)
      lines.push([t('Мин'), String(mines)], [t('Мины в клетках'), layout.map((c) => c + 1).join(', ')])
      break
    }
    case 'plinko': {
      const rows = (Number(params.rows) || 8) as PlinkoRows
      const risk = (params.risk as PlinkoRisk) || 'mid'
      const path = plinkoPath(floats(rows), rows)
      const slot = path.filter(Boolean).length
      lines.push(
        [t('Путь'), path.map((r) => (r ? 'R' : 'L')).join('')],
        [t('Лунка'), `${slot + 1} / ${rows + 1}`],
        [t('Множитель'), fmtMult(plinkoMultipliers(rows, risk)[slot])],
      )
      break
    }
    case 'contract': {
      const pool = contractPool(Number(params.total), giftCatalog())
      if (!pool.length) return t('Нет подарков под эту сумму')
      const [u] = floats(1)
      const won = pool[pickIndex(pool.map((p) => p.chance), u)].gift
      lines.push([t('Число'), u.toFixed(8)], [t('Выпал подарок'), won.name])
      break
    }
    case 'battle': {
      const ids = String(params.cases ?? '').split(',').filter(Boolean)
      const players = Number(params.players) || 2
      const list = ids.map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseDef => !!c)
      if (!list.length) return t('Выберите кейс')
      const us = floats(list.length * players + 1)
      const totals = Array.from({ length: players }, () => 0)
      list.forEach((c, r) => {
        for (let p = 0; p < players; p++) {
          const item = c.items[pickIndex(c.items.map((i) => i.chance), us[r * players + p])]
          totals[p] += getGift(item.giftId).price
        }
      })
      const best = Math.max(...totals)
      const leaders = totals.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0)
      const winner = leaders[Math.floor(us[us.length - 1] * leaders.length)]
      totals.forEach((v, i) => lines.push([t('Игрок {n}', { n: i + 1 }), `${v.toFixed(2)} TON`]))
      lines.push([t('Победитель'), t('Игрок {n}', { n: winner + 1 })])
      break
    }
    case 'coinflip': {
      const [u] = floats(1)
      lines.push([t('Число'), u.toFixed(8)], [t('Выпало'), coinSide(u) === 'ton' ? 'TON' : 'Star'])
      break
    }
    case 'crash': {
      const [u] = floats(1)
      lines.push([t('Число'), u.toFixed(8)], [t('Точка краша'), fmtMult(crashPoint(undefined, u))])
      break
    }
    case 'roulette': {
      const [u] = floats(1)
      const cell = rouletteCell(u)
      lines.push([t('Ячейка'), `${cell + 1} / ${ROULETTE_CELLS.length}`], [t('Цвет'), t(ROULETTE_LABEL[ROULETTE_CELLS[cell]])])
      break
    }
    case 'jackpot': {
      const [u] = floats(1)
      lines.push([t('Билет'), pct(u)])
      const weights = String(params.weights ?? '').split(',').map(Number).filter((x) => x > 0)
      if (weights.length > 1) lines.push([t('Победитель'), t('Игрок {n}', { n: pickByWeight(weights, u) + 1 })])
      break
    }
  }
  return { hash: sha256Hex(seed), lines }
}
