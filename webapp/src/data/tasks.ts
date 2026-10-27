import { tk } from '../lib/i18n'
import type { Stats } from '../state/store'

export type TaskAction = 'subscribe' | 'deposit' | 'invite' | 'share' | 'play' | 'daily'

export interface TaskDef {
  id: string
  title: string
  sub: string
  /** Награда в TON. */
  reward: number
  /** daily обновляется раз в сутки, weekly — с турнирной неделей, once — навсегда. */
  repeat: 'daily' | 'weekly' | 'once'
  action: TaskAction
  goal?: number
  progress?(s: Stats, refs: number): number
}

// Награды в TON сразу попадают на баланс. Перед запуском на настоящие деньги их нужно закрыть отыгрышем,
// иначе задания будут фармить мультиаккаунтами
export const TASKS: TaskDef[] = [
  { id: 'daily', title: tk('Ежедневный бонус'), sub: tk('Заходите каждый день'), reward: 0.1, repeat: 'daily', action: 'daily' },
  { id: 'subscribe', title: tk('Подписка на канал'), sub: tk('Крупные выигрыши и новые кейсы'), reward: 0.5, repeat: 'once', action: 'subscribe' },
  {
    id: 'play5',
    title: tk('Сыграть 5 игр'),
    sub: tk('Любые игры за сегодня'),
    reward: 0.2,
    repeat: 'daily',
    action: 'play',
    goal: 5,
    progress: (s) => s.betsToday,
  },
  {
    id: 'deposit',
    title: tk('Первое пополнение'),
    sub: tk('Любым способом от 1 TON'),
    reward: 1,
    repeat: 'once',
    action: 'deposit',
    goal: 1,
    progress: (s) => s.deposited,
  },
  {
    id: 'share',
    title: tk('Поделиться выигрышем'),
    sub: tk('В сторис или в чат'),
    reward: 0.25,
    repeat: 'once',
    action: 'share',
    goal: 1,
    progress: (s) => s.shares,
  },
  {
    id: 'invite',
    title: tk('Пригласить 3 друзей'),
    sub: tk('Засчитываются друзья с депозитом'),
    reward: 1.5,
    repeat: 'once',
    action: 'invite',
    goal: 3,
    progress: (_, refs) => refs,
  },
  {
    id: 'wager',
    title: tk('Оборот 50 TON за неделю'),
    sub: tk('Ставки в любых играх'),
    reward: 0.5,
    repeat: 'weekly',
    action: 'play',
    goal: 50,
    progress: (s) => s.wageredWeek,
  },
]
