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

// Шансы считаются из цен (минимальные цены коллекций на Fragment) так, чтобы средний выигрыш был
// ровно RTP × цена кейса. Подарки показываются красивыми моделями из SHOWCASE в gifts.ts
const SEEDS: CaseSeed[] = [
  {
    // Монеты TON вместо подарков: при выигрыше сразу зачисляются на баланс. ❌ — ничего не выпало
    id: 'bomzh',
    name: tk('Бомж'),
    price: 0.1,
    cover: 'ton-2',
    accent: '#e0a83a',
    giftIds: ['ton-0', 'ton-0.01', 'ton-0.02', 'ton-0.05', 'ton-0.1', 'ton-0.5', 'ton-1', 'ton-2'],
  },
  {
    id: 'sweet',
    name: tk('Сладкий'),
    price: 1.5,
    cover: 'cookieheart',
    accent: '#ff7ab8',
    tag: tk('Новый'),
    giftIds: [
      'ton-0.1', 'ton-0.2', 'ton-0.5',
      'lolpop', 'icecream', 'whipcupcake', 'moussecake', 'homemadecake', 'gingercookie', 'candycane',
      'cookieheart', 'bunnymuffin', 'berrybox', 'jellybunny', 'happybrownie', 'hypnolollipop', 'vicecream',
    ],
  },
  {
    id: 'luck',
    name: tk('Удача'),
    price: 2.5,
    cover: 'luckylocket',
    accent: '#3fd47f',
    tag: tk('Новый'),
    giftIds: [
      'ton-0.3', 'ton-0.5', 'ton-1',
      'luckylocket', 'diamondring', 'rarebird', 'crystalball', 'hangingstar', 'evileye', 'bunnymuffin',
      'jollychimp', 'bowtie', 'faithamulet', 'springbasket', 'lightsword', 'snowglobe', 'cloverpin',
      'moneypot', 'jackinthebox', 'swagbag', 'libertyfigure', 'partysparkler', 'lolpop',
    ],
  },
  {
    id: 'space',
    name: tk('Космос'),
    price: 3.5,
    cover: 'astralshard',
    accent: '#7b5cff',
    tag: tk('Новый'),
    giftIds: [
      'ton-0.2', 'ton-0.3', 'ton-0.4',
      'heroichelmet', 'astralshard', 'iongem', 'magicpotion', 'nekohelmet', 'bondedring', 'genielamp',
      'electricskull', 'skystilettos', 'ionicdryer', 'surgeboard', 'inputkey', 'moonpendant', 'stellarrocket',
      'miragelamp', 'starnotepad', 'tamagadget', 'chillflame', 'vicecream', 'lightsword',
    ],
  },
  {
    // Авторский кейс казино: кепка Дурова, браслет-«картье», оскар, лунный кулон и осколок + мелочь
    id: 'jackpot',
    name: tk('Джекпот'),
    price: 5,
    cover: 'durovscap',
    accent: '#ffc542',
    tag: tk('Авторский'),
    giftIds: [
      'ton-0.5', 'ton-1', 'ton-2',
      'durovscap', 'nailbracelet', 'astralshard', 'minioscar', 'moonpendant',
      'poolfloat', 'icecream', 'whipcupcake', 'lolpop',
    ],
  },
  {
    id: 'legend',
    name: tk('Легенда'),
    price: 25,
    cover: 'plushpepe',
    accent: '#ff5f7a',
    tag: tk('Топ'),
    giftIds: [
      'ton-1', 'ton-2',
      'plushpepe', 'heartlocket', 'resistancedog', 'durovscap', 'preciouspeach', 'scaredcat', 'mightyarm',
      'lootbag', 'westsidesign', 'kissedfrog', 'swisswatch', 'skystilettos', 'ionicdryer', 'trappedheart',
    ],
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

/** Кейсы по текущим ценам подарков: с сервером цены приходят со склада, поэтому шансы пересчитываются. */
export const buildCases = (): CaseDef[] => SEEDS.filter((s) => !s.event || s.event.endsAt > Date.now()).map(buildCase)
