// Демо-данные для рефералки, промокодов и турнира. В бою всё это приходит с бэкенда
import { COLORS, NAMES, seeded } from './players'

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

export const REF_FRIENDS: Friend[] = [
  { name: 'tonwhale', color: COLORS[0], joinedAt: now - 12 * DAY, wagered: 1290 },
  { name: 'kirill.eth', color: COLORS[1], joinedAt: now - 9 * DAY, wagered: 340 },
  { name: 'Мария', color: COLORS[2], joinedAt: now - 4 * DAY, wagered: 128 },
  { name: 'carlos_ton', color: COLORS[4], joinedAt: now - DAY, wagered: 36 },
  { name: 'sasha_k', color: COLORS[5], joinedAt: now - 2 * 3600000, wagered: 0 },
]

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

/** Таблица недели. Очки растут к концу недели, как в живом турнире. */
export function weeklyLeaders(start: number, at = Date.now()): Leader[] {
  const rnd = seeded(start / DAY)
  const progress = Math.min(1, Math.max(0.05, (at - start) / (7 * DAY)))
  return Array.from({ length: 40 }, (_, i) => ({
    name: NAMES[Math.floor(rnd() * NAMES.length)] + (i > NAMES.length ? `_${i}` : ''),
    color: COLORS[i % COLORS.length],
    points: Math.round(9000 * Math.exp(-i * 0.16) * (0.75 + rnd() * 0.5) * progress),
  })).sort((a, b) => b.points - a.points)
}
