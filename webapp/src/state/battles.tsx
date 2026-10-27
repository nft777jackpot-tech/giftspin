import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from '../components/Toaster'
import type { CaseDef } from '../data/cases'
import { getGift, isCoin, randomNum } from '../data/gifts'
import { randomPlayer } from '../data/players'
import { newRound, roundFloats, type RoundSeed } from '../lib/fair'
import { t } from '../lib/i18n'
import { pickIndex } from '../lib/rtp'
import { getMe } from '../lib/telegram'
import { useStore } from './store'

export const COUNTDOWN_MS = 3000
export const ROUND_MS = 3800
export const MAX_ROUNDS = 10

export interface Seat {
  id: string
  name: string
  color: string
  me?: boolean
}

export interface Drop {
  giftId: string
  num: number
}

export interface Battle {
  id: string
  caseIds: string[]
  seats: (Seat | null)[]
  /** Стоимость участия для одного игрока, TON. */
  cost: number
  round: RoundSeed
  createdAt: number
  startedAt?: number
  /** drops[раунд][место] */
  drops?: Drop[][]
  winner?: number
  settled?: boolean
}

export type Stage = 'waiting' | 'countdown' | 'rolling' | 'done'

/** Где сейчас батл: раунды идут по таймеру от startedAt, поэтому состояние считается из времени. */
export function battleStage(b: Battle, now: number): { stage: Stage; round: number } {
  if (!b.startedAt) return { stage: 'waiting', round: 0 }
  const t0 = now - b.startedAt - COUNTDOWN_MS
  if (t0 < 0) return { stage: 'countdown', round: 0 }
  const round = Math.floor(t0 / ROUND_MS)
  if (round >= b.caseIds.length) return { stage: 'done', round: b.caseIds.length }
  return { stage: 'rolling', round }
}

export function battleEndsAt(b: Battle): number {
  return (b.startedAt ?? Infinity) + COUNTDOWN_MS + b.caseIds.length * ROUND_MS
}

/** Сумма выпавшего у места за первые rounds раундов. */
export function seatTotal(b: Battle, seat: number, rounds = b.caseIds.length): number {
  return (b.drops ?? []).slice(0, rounds).reduce((s, r) => s + getGift(r[seat].giftId).price, 0)
}

interface BattlesCtx {
  battles: Battle[]
  create(caseIds: string[], size: number): string | null
  join(id: string): boolean
  callBot(id: string): void
}

const Ctx = createContext<BattlesCtx | null>(null)
let seq = 0

// Исход всех раундов считается из сида при старте: числа идут по раундам, внутри — по местам
function start(b: Battle, cases: CaseDef[]): Battle {
  const list = b.caseIds.map((id) => cases.find((c) => c.id === id)!)
  const size = b.seats.length
  const us = roundFloats(b.round.seed, list.length * size + 1)
  const drops = list.map((c, r) =>
    b.seats.map((_, p) => ({ giftId: c.items[pickIndex(c.items.map((i) => i.chance), us[r * size + p])].giftId, num: randomNum() })),
  )
  const totals = b.seats.map((_, p) => drops.reduce((s, row) => s + getGift(row[p].giftId).price, 0))
  const best = Math.max(...totals)
  const leaders = totals.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0)
  const winner = leaders[Math.floor(us[us.length - 1] * leaders.length)]
  return { ...b, startedAt: Date.now(), drops, winner }
}

function botSeat(): Seat {
  const p = randomPlayer()
  return { id: p.id, name: p.name, color: p.color }
}

export function BattlesProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [battles, setBattles] = useState<Battle[]>([])
  const live = useRef(store)
  live.current = store
  const battlesRef = useRef(battles)
  battlesRef.current = battles

  const fill = useCallback((b: Battle, seat: Seat): Battle => {
    const i = b.seats.indexOf(null)
    if (i < 0) return b
    const seats = [...b.seats]
    seats[i] = seat
    const next = { ...b, seats }
    return seats.every(Boolean) ? start(next, live.current.cases) : next
  }, [])

  useEffect(() => {
    const cheap = () => live.current.cases.filter((c) => c.price <= 30 && !c.custom)
    const botBattle = (): Battle => {
      const pool = cheap()
      const n = 1 + Math.floor(Math.random() * 4)
      const caseIds = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)].id)
      const size = 2 + Math.floor(Math.random() * 3)
      const cost = caseIds.reduce((s, id) => s + live.current.cases.find((c) => c.id === id)!.price, 0)
      const seats: (Seat | null)[] = Array.from({ length: size }, () => null)
      seats[0] = botSeat()
      return { id: `b${++seq}`, caseIds, seats, cost, round: newRound(), createdAt: Date.now() }
    }

    setBattles(Array.from({ length: 4 }, botBattle))

    const tick = window.setInterval(() => {
      const now = Date.now()
      setBattles((list) => {
        let next = list.map((b) => {
          if (b.startedAt || !b.seats.includes(null)) return b
          const mine = b.seats.some((s) => s?.me)
          return Math.random() < (mine ? 0.3 : 0.12) ? fill(b, botSeat()) : b
        })
        // Завершённые чужие батлы убираем через полминуты, свои — через пару минут
        next = next.filter((b) => {
          const end = battleEndsAt(b)
          const mine = b.seats.some((s) => s?.me)
          return now - end < (mine ? 120000 : 30000)
        })
        if (next.filter((b) => !b.startedAt).length < 4 && Math.random() < 0.3) next = [...next, botBattle()]
        return next
      })
    }, 900)
    return () => clearInterval(tick)
  }, [fill])

  // Выплата: победитель забирает подарки всех участников
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ready = battlesRef.current.filter((b) => b.drops && !b.settled && Date.now() >= battleEndsAt(b))
      if (!ready.length) return
      const ids = new Set(ready.map((b) => b.id))
      const mark = (list: Battle[]) => list.map((b) => (ids.has(b.id) ? { ...b, settled: true } : b))
      // ref обновляем сразу, чтобы следующий тик не выплатил тот же батл до перерисовки
      battlesRef.current = mark(battlesRef.current)
      setBattles(mark)
      for (const b of ready) {
        if (!b.seats[b.winner!]?.me) continue
        const drops = b.drops!.flat()
        // Монеты — это TON: сразу на баланс, подарки — в инвентарь
        const coins = drops.filter((d) => isCoin(d.giftId)).reduce((s, d) => s + getGift(d.giftId).price, 0)
        if (coins > 0) live.current.credit(coins, t('Кейс-батл'))
        drops.filter((d) => !isCoin(d.giftId)).forEach((d) => live.current.addItem(d.giftId, d.num))
        toast(coins > 0 ? t('Батл выигран, выигрыш зачислен') : t('Батл выигран, подарки в инвентаре'), 'success')
      }
    }, 300)
    return () => clearInterval(timer)
  }, [])

  const create = useCallback((caseIds: string[], size: number) => {
    const cost = caseIds.reduce((s, id) => s + live.current.cases.find((c) => c.id === id)!.price, 0)
    if (!live.current.spend(cost, t('Кейс-батл'))) return null
    const me = getMe()
    const seats: (Seat | null)[] = Array.from({ length: size }, () => null)
    seats[0] = { id: 'me', name: me.name || t('Вы'), color: '#2ea7ff', me: true }
    const b: Battle = { id: `b${++seq}`, caseIds, seats, cost, round: newRound(), createdAt: Date.now() }
    setBattles((list) => [b, ...list])
    return b.id
  }, [])

  const join = useCallback(
    (id: string) => {
      const b = battles.find((x) => x.id === id)
      if (!b || b.startedAt || !b.seats.includes(null) || b.seats.some((s) => s?.me)) return false
      if (!live.current.spend(b.cost, t('Кейс-батл'))) return false
      const me = getMe()
      setBattles((list) => list.map((x) => (x.id === id ? fill(x, { id: 'me', name: me.name || t('Вы'), color: '#2ea7ff', me: true }) : x)))
      return true
    },
    [battles, fill],
  )

  const callBot = useCallback((id: string) => setBattles((list) => list.map((b) => (b.id === id && !b.startedAt ? fill(b, botSeat()) : b))), [fill])

  const value = useMemo(() => ({ battles, create, join, callBot }), [battles, create, join, callBot])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBattles(): BattlesCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useBattles outside BattlesProvider')
  return c
}
