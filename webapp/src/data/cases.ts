import { RTP } from '../config'
import { tk } from '../lib/i18n'
import { caseOdds } from '../lib/rtp'
import { getGift } from './gifts'

export interface CaseItem {
  giftId: string
  chance: number
}

export interface CaseDef {
  id: string
  /** Ключ перевода для встроенных кейсов, для созданных в админке — имя как есть. */
  name: string
  price: number
  cover: string
  accent: string
  tag?: string
  /** Праздничный кейс: показывается отдельно и пропадает после даты. */
  event?: { endsAt: number }
  custom?: boolean
  items: CaseItem[]
}

export interface CaseSeed {
  id: string
  name: string
  price: number
  cover: string
  accent: string
  tag?: string
  event?: { endsAt: number }
  custom?: boolean
  giftIds: string[]
}

const SEEDS: CaseSeed[] = [
  {
    // Монеты TON вместо подарков: при выигрыше сразу зачисляются на баланс
    id: 'bomzh',
    name: tk('Бомж'),
    price: 0.1,
    cover: 'ton-2',
    accent: '#e0a83a',
    tag: tk('Новый'),
    giftIds: ['ton-0.01', 'ton-0.02', 'ton-0.05', 'ton-0.1', 'ton-0.5', 'ton-1', 'ton-2'],
  },
]

/** Цена кейса должна давать среднее выпадение строго между самым дешёвым и самым дорогим подарком. */
export function caseIsValid(price: number, giftIds: string[], rtp = RTP): boolean {
  if (giftIds.length < 2 || price <= 0) return false
  const values = giftIds.map((id) => getGift(id).price)
  const target = rtp * price
  return target > Math.min(...values) && target < Math.max(...values)
}

// Шансы считаются из цен так, чтобы средний выигрыш был ровно RTP × цена кейса
export function buildCase({ giftIds, ...seed }: CaseSeed): CaseDef {
  const values = giftIds.map((id) => getGift(id).price)
  const odds = caseOdds(values, seed.price, RTP)
  return { ...seed, items: giftIds.map((giftId, i) => ({ giftId, chance: odds[i] })) }
}

export const CASES: CaseDef[] = SEEDS.filter((s) => !s.event || s.event.endsAt > Date.now()).map(buildCase)
