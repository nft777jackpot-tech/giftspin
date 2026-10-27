import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from '../components/Toaster'
import { RTP, REF_SHARE } from '../config'
import { CASES, type CaseDef } from '../data/cases'
import { findGift, getGift, GIFTS, randomNum, registerGifts, setCatalog, type Gift } from '../data/gifts'
import { PROMO_SEEDS, REF_FRIENDS, type Promo } from '../data/social'
import { api, type ServerGift, type ServerMe, type ServerPlay, type StockInfo } from '../lib/api'
import { fairFloats, randomSeed, sha256Hex } from '../lib/fair'
import type { GameId } from '../lib/verify'

export interface InvItem {
  uid: string
  giftId: string
  num: number
}

export type SheetName = 'deposit' | 'withdraw' | 'promo' | 'lang' | 'bg' | null

export interface Tx {
  id: string
  kind: 'deposit' | 'withdraw' | 'bet' | 'win' | 'sell' | 'bonus' | 'ref'
  title: string
  /** Сумма в TON, со знаком. */
  amount: number
  at: number
}

/** Игра на личной паре сидов, её можно пересчитать после раскрытия серверного сида. */
export interface PlayRound {
  id: string
  game: GameId
  title: string
  nonce: number
  clientSeed: string
  hash: string
  params: Record<string, string | number>
  result: string
  at: number
}

export interface Roll {
  floats: number[]
  nonce: number
  hash: string
  clientSeed: string
}

export interface Stats {
  bets: number
  wagered: number
  wageredWeek: number
  betsToday: number
  deposited: number
  shares: number
  bestWin: number
}

interface SeedPair {
  serverSeed: string
  hash: string
  clientSeed: string
  nonce: number
}

export type PromoResult = 'ok' | 'unknown' | 'used' | 'already'

export interface GameSpec {
  /** Имя игры, оно же путь на сервере: /games/<kind>. */
  kind: string
  bet: number
  /** Подпись операции в истории баланса. */
  label: string
  /** Подробная запись раунда для страницы «Честная игра». */
  roundTitle: string
  /** Параметры игры: уходят на сервер и в запись раунда. */
  params: Record<string, number | string>
  /** Сколько чисел сида нужно локальному расчёту (демо без сервера). */
  floats: number
  local(floats: number[]): { multiplier: number; result: string; win: boolean; extra?: Record<string, unknown> }
}

export interface GameOutcome {
  multiplier: number
  win: boolean
  /** Поля исхода для анимации: дайс — roll, плинко — path и slot. */
  fields: Record<string, unknown>
  /** Применить результат к балансу и журналу — после анимации. */
  reveal(): void
}

interface Store {
  /** Сервер с кошельком проекта. null — сервер не запущен, всё работает в демо. */
  server: ServerMe | null
  refreshServer(): Promise<void>
  inventory: InvItem[]
  /** Витрина: подарки, которые сейчас можно выиграть. С сервером — только со склада. */
  catalog: Gift[]
  /** Склад подарков. null — сервер не запущен. */
  warehouse: StockInfo | null
  /** Подарки игрока, которые выводятся или уже переданы ему в Telegram. */
  giftRequests: ServerGift[]
  history: Tx[]
  sheet: SheetName
  openSheet(s: SheetName): void
  /** Баланс в TON — единственной валюте. */
  balanceTon: number
  /** Списывает ставку с баланса. Возвращает false, если не хватает. */
  spend(ton: number, title: string): boolean
  credit(ton: number, title: string): void
  /** Игры, которые считает сервер. Для них исход приходит с сервера, клиент его не задаёт. */
  serverGames: string[]
  /**
   * Сыграть одиночную игру. Если игра в serverGames — исход и баланс считает сервер; иначе локально (демо).
   * reveal() применяет результат после анимации. 'insufficient' — не хватает баланса.
   */
  playGame(spec: GameSpec): Promise<GameOutcome | 'insufficient' | null>
  /** Пополнение, вывод и бонусы, суммы в TON. */
  deposit(amount: number, title: string): void
  withdraw(amount: number, title: string): boolean
  bonus(amount: number, title: string): void
  addItem(giftId: string, num?: number): InvItem
  /** Подарки ушли в ставку. С сервером они возвращаются на склад. */
  removeItems(uids: string[]): void
  sellItems(uids: string[]): number
  /** Вывод подарков в Telegram. С сервером — заявка, которую проверяет администратор. */
  withdrawGifts(uids: string[]): void

  /** Текущая пара сидов. Серверный сид скрыт до смены пары. */
  seeds: { hash: string; clientSeed: string; nonce: number }
  /** Раскрытые серверные сиды по их хешу. */
  revealed: Record<string, string>
  roll(count: number): Roll
  rotateSeeds(clientSeed?: string): void
  rounds: PlayRound[]
  logRound(r: Omit<PlayRound, 'id' | 'at'>): void

  stats: Stats
  noteShare(): void
  tasksDone: Record<string, number>
  completeTask(id: string, reward: number, title: string): void

  promos: Promo[]
  promo: string | null
  activatePromo(code: string): PromoResult
  addPromo(p: Promo): void

  refEarned: number
  refClaimed: number
  claimRef(): number

  cases: CaseDef[]
  addCase(c: CaseDef): void
  removeCase(id: string): void
}

const Ctx = createContext<Store | null>(null)

let uidSeq = 0
const uid = () => `i${Date.now().toString(36)}${(++uidSeq).toString(36)}`

const START_INVENTORY: InvItem[] = [
  { uid: uid(), giftId: 'kissedfrog', num: 1204 },
  { uid: uid(), giftId: 'eternalrose', num: 388 },
  { uid: uid(), giftId: 'jellybunny', num: 2051 },
  { uid: uid(), giftId: 'hexpot', num: 77 },
  { uid: uid(), giftId: 'lolpop', num: 912 },
  { uid: uid(), giftId: 'spyagaric', num: 1530 },
  { uid: uid(), giftId: 'witchhat', num: 640 },
  { uid: uid(), giftId: 'deskcalendar', num: 2210 },
]

const EMPTY_STATS: Stats = { bets: 0, wagered: 0, wageredWeek: 0, betsToday: 0, deposited: 0, shares: 0, bestWin: 0 }

function newSeeds(clientSeed = randomSeed(8)): SeedPair {
  const serverSeed = randomSeed()
  return { serverSeed, hash: sha256Hex(serverSeed), clientSeed, nonce: 0 }
}

// Доход с рефералов в демо: доля комиссии казино с их оборота
const REF_EARNED = REF_FRIENDS.reduce((s, f) => s + f.wagered * (1 - RTP) * REF_SHARE, 0)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [balanceTon, setBalance] = useState(25)
  const [inventory, setInventory] = useState<InvItem[]>(START_INVENTORY)
  const [history, setHistory] = useState<Tx[]>([])
  const [sheet, openSheet] = useState<SheetName>(null)
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [tasksDone, setTasksDone] = useState<Record<string, number>>({})
  const [promos, setPromos] = useState<Promo[]>(PROMO_SEEDS)
  const [promo, setPromo] = useState<string | null>(null)
  const [refClaimed, setRefClaimed] = useState(0)
  const [customCases, setCustomCases] = useState<CaseDef[]>([])

  // Пара сидов живёт в ref: roll вызывается из таймеров и должен сразу видеть новый nonce
  const seedRef = useRef<SeedPair>(newSeeds())
  const [seeds, setSeeds] = useState(() => ({ hash: seedRef.current.hash, clientSeed: seedRef.current.clientSeed, nonce: 0 }))
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [rounds, setRounds] = useState<PlayRound[]>([])

  const log = useCallback((kind: Tx['kind'], title: string, amount: number) => {
    setHistory((h) => [{ id: uid(), kind, title, amount, at: Date.now() }, ...h].slice(0, 200))
  }, [])

  const add = useCallback((delta: number) => setBalance((b) => b + delta), [])

  // Когда сервер запущен, баланс настоящий: он приходит с сервера, а каждое изменение записывается в его журнал
  const [server, setServer] = useState<ServerMe | null>(null)
  const [serverGames, setServerGames] = useState<string[]>([])
  const serverRef = useRef<ServerMe | null>(null)
  const syncTon = useCallback((balance: string) => setBalance(Number(balance)), [])

  // Склад: с сервером витрина и инвентарь — подарки со склада, без сервера — демо-список и инвентарь в браузере
  const [catalog, setCatalogState] = useState<Gift[]>(GIFTS)
  const [warehouse, setWarehouse] = useState<StockInfo | null>(null)
  const [giftRequests, setGiftRequests] = useState<ServerGift[]>([])
  // Выигранный подарок сначала показывается временной карточкой, пока сервер закрепляет за игроком экземпляр
  const pendingWins = useRef(new Map<string, InvItem>())
  const realIds = useRef(new Map<string, string>())
  const serverId = (uid: string) => realIds.current.get(uid) ?? uid

  const syncGifts = useCallback(async () => {
    const [stock, mine] = await Promise.all([api<StockInfo>('/stock'), api<ServerGift[]>('/inventory')])
    const list: Gift[] = stock.gifts.map((g) => ({ id: g.slug, name: g.name, price: Number(g.price), num: g.num }))
    setCatalog(list)
    setCatalogState(list)
    setWarehouse(stock)
    // Подарок игрока мог уйти с витрины, но его название и цена нужны инвентарю
    registerGifts(mine.map((g) => ({ id: g.slug, name: g.name, price: g.price ? Number(g.price) : (findGift(g.slug)?.price ?? 0) })))
    setInventory([...pendingWins.current.values(), ...mine.filter((g) => g.status === 'reserved').map((g) => ({ uid: g.id, giftId: g.slug, num: g.num }))])
    setGiftRequests(mine.filter((g) => g.status !== 'reserved'))
  }, [])

  const refreshServer = useCallback(async () => {
    try {
      const me = await api<ServerMe>('/me')
      serverRef.current = me
      setServer(me)
      setServerGames(me.serverGames ?? [])
      syncTon(me.balance)
      await syncGifts().catch(() => {})
    } catch {
      if (serverRef.current) {
        setCatalog(null)
        setCatalogState(GIFTS)
        setWarehouse(null)
      }
      serverRef.current = null
      setServer(null)
      setServerGames([])
    }
  }, [syncTon, syncGifts])

  useEffect(() => {
    refreshServer()
    const timer = setInterval(refreshServer, 10_000)
    return () => clearInterval(timer)
  }, [refreshServer])

  /** Изменение баланса: сразу на экране, а при запущенном сервере — ещё и в его журнале. */
  const move = useCallback(
    (delta: number, title: string) => {
      add(delta)
      const live = serverRef.current
      if (!live?.trustClientGames || delta === 0) return
      const kind = delta < 0 ? 'bet' : 'win'
      api<{ balance: string }>(`/game/${kind}`, { method: 'POST', body: { amount: Math.abs(delta).toFixed(9), game: title } })
        .then((r) => syncTon(r.balance))
        .catch((e) => {
          toast(String(e.message ?? e), 'error')
          refreshServer()
        })
    },
    [add, syncTon, refreshServer],
  )

  const spend = useCallback(
    (amountTon: number, title: string) => {
      if (amountTon <= 0 || amountTon > balanceTon + 1e-9) return false
      move(-amountTon, title)
      log('bet', title, -amountTon)
      setStats((s) => ({
        ...s,
        bets: s.bets + 1,
        betsToday: s.betsToday + 1,
        wagered: s.wagered + amountTon,
        wageredWeek: s.wageredWeek + amountTon,
      }))
      return true
    },
    [balanceTon, move, log],
  )

  const credit = useCallback(
    (amountTon: number, title: string) => {
      move(amountTon, title)
      log('win', title, amountTon)
      setStats((s) => ({ ...s, bestWin: Math.max(s.bestWin, amountTon) }))
    },
    [move, log],
  )

  const deposit = useCallback(
    (amount: number, title: string) => {
      // Настоящие TON приходят только переводом на кошелёк проекта
      if (serverRef.current) {
        toast('TON зачисляются переводом на кошелёк проекта', 'error')
        return
      }
      add(amount)
      log('deposit', title, amount)
      setStats((s) => ({ ...s, deposited: s.deposited + amount }))
    },
    [add, log],
  )

  const bonus = useCallback(
    (amount: number, title: string) => {
      move(amount, title)
      log('bonus', title, amount)
    },
    [move, log],
  )

  const withdraw = useCallback(
    (amount: number, title: string) => {
      // Вывод при запущенном сервере идёт заявкой через сервер, а не локальным списанием
      if (serverRef.current) return false
      if (amount <= 0 || amount > balanceTon + 1e-9) return false
      add(-amount)
      log('withdraw', title, -amount)
      return true
    },
    [balanceTon, add, log],
  )

  const addItem = useCallback(
    (giftId: string, num = randomNum()) => {
      if (!serverRef.current) {
        const item = { uid: uid(), giftId, num }
        setInventory((inv) => [item, ...inv])
        return item
      }
      // С сервером выигрыш — конкретный подарок со склада. Номер экземпляра станет известен после ответа
      const temp = { uid: uid(), giftId, num: 0 }
      pendingWins.current.set(temp.uid, temp)
      setInventory((inv) => [temp, ...inv])
      const drop = () => setInventory((inv) => inv.filter((i) => i.uid !== temp.uid))
      api<{ item?: ServerGift; credited?: string; balance?: string }>('/gifts/win', { method: 'POST', body: { slug: giftId, game: getGift(giftId).name } })
        .then((r) => {
          if (r.item) {
            const real = r.item
            realIds.current.set(temp.uid, real.id)
            setInventory((inv) => inv.map((i) => (i.uid === temp.uid ? { uid: real.id, giftId: real.slug, num: real.num } : i)))
          } else {
            drop()
            syncTon(r.balance!)
            toast(`Подарок закончился на складе, зачислено ${r.credited} TON`, 'success')
          }
        })
        .catch((e) => {
          drop()
          toast(String(e.message ?? e), 'error')
        })
        .finally(() => pendingWins.current.delete(temp.uid))
      return temp
    },
    [syncTon],
  )

  const removeItems = useCallback(
    (uids: string[]) => {
      setInventory((inv) => inv.filter((i) => !uids.includes(i.uid)))
      if (!serverRef.current) return
      const ids = uids.map(serverId).filter((id) => !pendingWins.current.has(id))
      if (ids.length) api('/gifts/release', { method: 'POST', body: { ids } }).catch(() => syncGifts().catch(() => {}))
    },
    [syncGifts],
  )

  const sellItems = useCallback(
    (uids: string[]) => {
      const sold = inventory.filter((i) => uids.includes(i.uid) || uids.some((u) => serverId(u) === i.uid))
      const total = sold.reduce((sum, i) => sum + getGift(i.giftId).price, 0)
      const soldUids = sold.map((i) => i.uid)
      setInventory((inv) => inv.filter((i) => !soldUids.includes(i.uid)))
      const title = sold.length === 1 ? getGift(sold[0].giftId).name : `${sold.length} × NFT`
      log('sell', title, total)
      if (!serverRef.current) {
        move(total, `sell: ${title}`)
        return total
      }
      // Продажу и цену считает сервер, баланс берём из его ответа
      add(total)
      api<{ balance: string }>('/gifts/sell', { method: 'POST', body: { ids: soldUids.map(serverId) } })
        .then((r) => syncTon(r.balance))
        .catch((e) => {
          toast(String(e.message ?? e), 'error')
          refreshServer()
        })
      return total
    },
    [inventory, move, log, add, syncTon, refreshServer],
  )

  const withdrawGifts = useCallback(
    (uids: string[]) => {
      setInventory((inv) => inv.filter((i) => !uids.includes(i.uid)))
      if (!serverRef.current) return
      api('/gifts/withdraw', { method: 'POST', body: { ids: uids.map(serverId) } })
        .then(() => syncGifts())
        .catch((e) => {
          toast(String(e.message ?? e), 'error')
          syncGifts().catch(() => {})
        })
    },
    [syncGifts],
  )

  const roll = useCallback((count: number): Roll => {
    const s = seedRef.current
    const nonce = s.nonce
    const floats = fairFloats(s.serverSeed, s.clientSeed, nonce, count)
    s.nonce += 1
    setSeeds({ hash: s.hash, clientSeed: s.clientSeed, nonce: s.nonce })
    return { floats, nonce, hash: s.hash, clientSeed: s.clientSeed }
  }, [])

  const rotateSeeds = useCallback((clientSeed?: string) => {
    const old = seedRef.current
    setRevealed((r) => ({ ...r, [old.hash]: old.serverSeed }))
    const next = newSeeds(clientSeed?.trim() || old.clientSeed)
    seedRef.current = next
    setSeeds({ hash: next.hash, clientSeed: next.clientSeed, nonce: 0 })
  }, [])

  const logRound = useCallback((r: Omit<PlayRound, 'id' | 'at'>) => {
    setRounds((list) => [{ ...r, id: uid(), at: Date.now() }, ...list].slice(0, 100))
  }, [])

  const playGame = useCallback(
    async (spec: GameSpec): Promise<GameOutcome | 'insufficient' | null> => {
      if (spec.bet <= 0 || spec.bet > balanceTon + 1e-9) return 'insufficient'
      const round = (nonce: number, clientSeed: string, hash: string, result: string) =>
        logRound({ game: spec.kind as GameId, title: spec.roundTitle, nonce, clientSeed, hash, params: spec.params, result })

      // Игра на сервере: сервер списывает, считает и зачисляет сам. Клиент показывает результат с его слов
      if (serverRef.current && serverGames.includes(spec.kind)) {
        add(-spec.bet) // списываем на экране сразу, итог подтвердит сервер
        setStats((st) => ({ ...st, bets: st.bets + 1, betsToday: st.betsToday + 1, wagered: st.wagered + spec.bet, wageredWeek: st.wageredWeek + spec.bet }))
        try {
          const res = await api<ServerPlay>(`/games/${spec.kind}`, { method: 'POST', body: { amount: spec.bet.toFixed(9), ...spec.params } })
          const payout = Number(res.payout)
          const reveal = () => {
            syncTon(res.balance)
            log('bet', spec.label, -spec.bet)
            if (payout > 0) {
              log('win', spec.label, payout)
              setStats((st) => ({ ...st, bestWin: Math.max(st.bestWin, payout) }))
            }
            round(res.proof.nonce, res.proof.clientSeed, res.proof.hash, res.result)
          }
          return { multiplier: res.multiplier, win: res.win, fields: res as unknown as Record<string, unknown>, reveal }
        } catch (e) {
          toast(String((e as Error).message ?? e), 'error')
          refreshServer()
          return null
        }
      }

      // Демо без сервера: исход из локальных сидов, баланс меняется на клиенте
      if (!spend(spec.bet, spec.label)) return 'insufficient'
      const fl = roll(spec.floats)
      const c = spec.local(fl.floats)
      const reveal = () => {
        if (c.multiplier > 0) credit(spec.bet * c.multiplier, spec.label)
        round(fl.nonce, fl.clientSeed, fl.hash, c.result)
      }
      return { multiplier: c.multiplier, win: c.win, fields: c.extra ?? {}, reveal }
    },
    [balanceTon, serverGames, add, syncTon, log, logRound, refreshServer, spend, credit, roll],
  )


  const noteShare = useCallback(() => setStats((s) => ({ ...s, shares: s.shares + 1 })), [])

  const completeTask = useCallback(
    (id: string, reward: number, title: string) => {
      setTasksDone((d) => ({ ...d, [id]: Date.now() }))
      bonus(reward, title)
    },
    [bonus],
  )

  const activatePromo = useCallback(
    (raw: string): PromoResult => {
      const code = raw.trim().toUpperCase()
      if (promo) return promo === code ? 'used' : 'already'
      const found = promos.find((p) => p.code === code)
      if (!found) return 'unknown'
      setPromo(code)
      setPromos((list) => list.map((p) => (p.code === code ? { ...p, activations: p.activations + 1 } : p)))
      bonus(found.reward, code)
      return 'ok'
    },
    [promo, promos, bonus],
  )

  const addPromo = useCallback((p: Promo) => setPromos((list) => [p, ...list.filter((x) => x.code !== p.code)]), [])

  const claimRef = useCallback(() => {
    const amount = Math.max(0, REF_EARNED - refClaimed)
    if (amount <= 0) return 0
    setRefClaimed((c) => c + amount)
    move(amount, 'ref')
    log('ref', 'Ref', amount)
    return amount
  }, [refClaimed, move, log])

  const cases = useMemo(() => [...CASES, ...customCases], [customCases])
  const addCase = useCallback((c: CaseDef) => setCustomCases((list) => [...list.filter((x) => x.id !== c.id), c]), [])
  const removeCase = useCallback((id: string) => setCustomCases((list) => list.filter((x) => x.id !== id)), [])

  const value = useMemo<Store>(
    () => ({
      server,
      refreshServer,
      inventory,
      catalog,
      warehouse,
      giftRequests,
      history,
      sheet,
      openSheet,
      balanceTon,
      spend,
      credit,
      serverGames,
      playGame,
      deposit,
      withdraw,
      bonus,
      addItem,
      removeItems,
      sellItems,
      withdrawGifts,
      seeds,
      revealed,
      roll,
      rotateSeeds,
      rounds,
      logRound,
      stats,
      noteShare,
      tasksDone,
      completeTask,
      promos,
      promo,
      activatePromo,
      addPromo,
      refEarned: REF_EARNED,
      refClaimed,
      claimRef,
      cases,
      addCase,
      removeCase,
    }),
    [
      server, refreshServer, inventory, catalog, warehouse, giftRequests, history, sheet, balanceTon, spend, credit, deposit, withdraw,
      bonus, serverGames, playGame, addItem, removeItems, sellItems, withdrawGifts, seeds, revealed, roll, rotateSeeds, rounds, logRound, stats, noteShare, tasksDone,
      completeTask, promos, promo, activatePromo, addPromo, refClaimed, claimRef, cases, addCase, removeCase,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

/** Кейс по id среди встроенных и созданных в админке. */
export function useCase(id: string): CaseDef | undefined {
  return useStore().cases.find((c) => c.id === id)
}
