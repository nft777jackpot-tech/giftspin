// Демо-данные для рефералки, промокодов и турнира. В бою всё это приходит с бэкенда

export interface Promo {
  code: string
  /** Блогер или канал, которому выдан код. */
  owner: string
  /** Награда в TON. */
  reward: number
  activations: number
  /** Сколько внесли и проиграли приведённые игроки, в TON. */
  deposits: number
  turnover: number
  createdAt: number
}

const DAY = 86400000
const now = Date.now()

export const PROMO_SEEDS: Promo[] = [
  { code: 'WELCOME', owner: 'GiftSpin', reward: 0.5, activations: 4120, deposits: 18400, turnover: 162000, createdAt: now - 60 * DAY },
  { code: 'PEPE', owner: '@pepe_drops', reward: 0.75, activations: 1310, deposits: 7900, turnover: 64200, createdAt: now - 21 * DAY },
  { code: 'TONNEWS', owner: '@ton_news', reward: 1, activations: 2264, deposits: 12650, turnover: 98100, createdAt: now - 14 * DAY },
  { code: 'FROG', owner: '@kissedfrog_club', reward: 0.3, activations: 486, deposits: 2140, turnover: 15800, createdAt: now - 6 * DAY },
  { code: 'REGALO', owner: '@regalos_ton', reward: 0.75, activations: 352, deposits: 1730, turnover: 11900, createdAt: now - 3 * DAY },
]

export interface Friend {
  name: string
  color: string
  joinedAt: number
  /** Оборот друга в TON. */
  wagered: number
}

// Пока нет сервера с реальными игроками, список друзей пуст — без выдуманных
export const REF_FRIENDS: Friend[] = []

// ---------- Турнир ----------

/** Начало текущей недели турнира: понедельник 00:00 UTC. */
export function weekStart(at = Date.now()): number {
  const d = new Date(at)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

export interface Leader {
  name: string
  color: string
  /** Очки — оборот за неделю в TON. */
  points: number
}

/** Таблица недели. Пока нет сервера с реальными игроками — пустая, без выдуманных. */
export function weeklyLeaders(): Leader[] {
  return []
}
