// Демо-статистика казино: фактический RTP по играм и сводка для админки.
// В бою считается бэкендом из журнала ставок и обновляется раз в час
import { RTP } from '../config'
import type { GameId } from '../lib/verify'
import { seeded } from './players'

export interface GameStat {
  game: GameId
  bets: number
  /** Оборот и выплаты за 30 дней, TON. */
  turnover: number
  payout: number
}

const TURNOVER: Record<GameId, number> = {
  case: 412000,
  battle: 168000,
  upgrade: 96000,
  crash: 254000,
  mines: 88000,
  plinko: 61000,
  roulette: 73000,
  dice: 44000,
  coinflip: 39000,
  contract: 27000,
  jackpot: 58000,
}

const rnd = seeded(2026)

export const GAME_STATS: GameStat[] = (Object.keys(TURNOVER) as GameId[]).map((game) => {
  const turnover = TURNOVER[game]
  // Отклонение от теории тем меньше, чем больше ставок
  const noise = (rnd() - 0.5) * 0.04 * Math.sqrt(100000 / turnover)
  return { game, bets: Math.round(turnover / (2 + rnd() * 4)), turnover, payout: turnover * (RTP + noise) }
})

export const actualRtp = (s: { turnover: number; payout: number }) => (s.turnover > 0 ? s.payout / s.turnover : 0)

export interface DayStat {
  day: number
  turnover: number
  payout: number
  deposits: number
  withdrawals: number
  players: number
}

const DAY = 86400000

export const DAILY: DayStat[] = Array.from({ length: 30 }, (_, i) => {
  const day = Date.now() - (29 - i) * DAY
  const growth = 0.6 + (i / 29) * 0.6
  const turnover = 42000 * growth * (0.8 + rnd() * 0.4)
  return {
    day,
    turnover,
    payout: turnover * (RTP + (rnd() - 0.5) * 0.08),
    deposits: turnover * (0.22 + rnd() * 0.06),
    withdrawals: turnover * (0.15 + rnd() * 0.06),
    players: Math.round(2400 * growth * (0.85 + rnd() * 0.3)),
  }
})

/** Состояние кассы. */
export const TREASURY = {
  /** Остаток горячего кошелька, TON. */
  hotWallet: 18420,
  /** Ниже этого остатка админка подсвечивает пополнение горячего кошелька. */
  hotWalletMin: 5000,
  gifts: { count: 1864, value: 61250 },
}
