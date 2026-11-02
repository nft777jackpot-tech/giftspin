import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '../components/Avatar'
import { BetInput } from '../components/BetInput'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { api } from '../lib/api'
import { fmtMult } from '../lib/format'
import { t } from '../lib/i18n'
import { onLive, rejoinRoom, serverNow, useLive } from '../lib/live'
import { BET_MS, demoRouletteSnap, phaseAt, SPIN_MS, type RouletteBetView, type RoulettePhase, type RouletteSnap } from '../lib/rouletteRounds'
import { ROULETTE_CELLS, rouletteMultiplier, type RouletteColor } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

const CELL = 58
const GAP = 6
const STEP = CELL + GAP
const REPS = 10
const REST_REP = 2
const LAND_REP = 8

const CELLS = Array.from({ length: REPS }, () => ROULETTE_CELLS).flat()
const N = ROULETTE_CELLS.length
const COLORS: RouletteColor[] = ['red', 'green', 'black']
const LABEL: Record<RouletteColor, string> = { red: 'Красное', green: 'Зелёное', black: 'Чёрное' }
const MULT: Record<RouletteColor, number> = {
  red: rouletteMultiplier('red'),
  green: rouletteMultiplier('green'),
  black: rouletteMultiplier('black'),
}
const AVATAR_COLORS = ['#2ea7ff', '#7b5cff', '#ff5fa8', '#22d68a', '#ffc542', '#ff8a4d', '#4dd6e8']

type Bets = Record<RouletteColor, number>
const emptyBets = (): Bets => ({ red: 0, green: 0, black: 0 })
const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
/** Сдвиг остановки внутри ячейки из номера раунда: у всех игроков лента встаёт одинаково. */
const jitterOf = (id: number) => ((((id * 9301 + 49297) % 233280) / 233280) - 0.5) * CELL * 0.8

const EMPTY: RouletteSnap = { id: 0, startAt: 0, hash: '', cell: null, seed: null, bets: [], history: [] }

/** Снимок раунда с сервера: время сервера переводим в часы устройства. */
function fromServer(msg: Record<string, unknown>): RouletteSnap {
  return {
    id: Number(msg.id),
    startAt: Number(msg.startAt) + (Date.now() - serverNow()),
    hash: String(msg.hash),
    cell: msg.cell === null ? null : Number(msg.cell),
    seed: (msg.seed as string | null) ?? null,
    bets: (msg.bets as RouletteBetView[]) ?? [],
    history: (msg.history as RouletteSnap['history']) ?? [],
  }
}

export function Roulette() {
  const { balanceTon, openSheet, server, spend, credit, serverMove, refreshServer } = useStore()
  const { me, connected } = useLive()
  // С сервером раунд общий и настоящий, без него — общее демо-расписание
  const shared = !!server
  const [snap, setSnap] = useState<RouletteSnap>(() => (shared ? EMPTY : demoRouletteSnap()))
  const [phase, setPhase] = useState<RoulettePhase>('betting')
  const [bet, setBet] = useState(1)
  // Свои ставки в демо: копятся и списываются, когда ставки закрыты
  const [localBets, setLocalBets] = useState<Bets>(emptyBets)
  const [pending, setPending] = useState(false)
  const [winColor, setWinColor] = useState<RouletteColor | null>(null)
  const [offset, setOffset] = useState(0)
  const [spinMs, setSpinMs] = useState(0)

  const reelRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const round = useRef({ id: 0, startAt: 0, cell: null as number | null, lastCell: 0, phase: 'betting' as RoulettePhase, spun: false, settled: false, charged: 0 })
  // Цикл анимации живёт вне React и читает свежие значения отсюда: баланс в spend меняется каждый ход
  const live = useRef({ snap, localBets, shared, me, spend, credit, refreshServer })
  live.current = { ...live.current, localBets, shared, me, spend, credit, refreshServer }
  if (shared) live.current.snap = snap

  const myBets: Bets = shared
    ? snap.bets.filter((b) => b.uid === me).reduce((acc, b) => ({ ...acc, [b.color]: acc[b.color] + Number(b.amount) }), emptyBets())
    : localBets

  const offsetFor = (i: number, jitter: number) => {
    const w = reelRef.current?.clientWidth ?? 360
    return -(i * STEP + CELL / 2 - w / 2 + jitter)
  }

  // Снимки общего раунда с сервера
  useEffect(() => {
    if (!shared) return
    setSnap(EMPTY)
    const off = onLive('roulette', (msg) => setSnap(fromServer(msg)))
    rejoinRoom()
    return off
  }, [shared])

  useEffect(() => {
    let raf = 0
    let lastDemo = 0
    const tick = () => {
      const now = Date.now()
      const r = round.current
      // Демо: раунд из общего расписания по часам устройства
      if (!live.current.shared && now - lastDemo > 200) {
        lastDemo = now
        const s = demoRouletteSnap(now)
        if (s.id !== live.current.snap.id || s.cell !== live.current.snap.cell || s.history[0]?.id !== live.current.snap.history[0]?.id) setSnap(s)
        live.current.snap = s
      }
      const s = live.current.snap
      if (s.id && s.id !== r.id) {
        // Новый раунд: лента без анимации встаёт на прошлую ячейку ближе к началу
        r.id = s.id
        r.startAt = s.startAt
        r.spun = false
        r.settled = false
        r.charged = 0
        r.lastCell = s.history[0]?.cell ?? r.lastCell
        setSpinMs(0)
        setOffset(offsetFor(REST_REP * N + r.lastCell, jitterOf(s.id - 1)))
        setWinColor(null)
        if (!live.current.shared) setLocalBets(emptyBets())
      }
      r.startAt = s.startAt
      r.cell = s.cell
      const p = s.id ? phaseAt(r.startAt, now) : 'betting'
      if (p !== r.phase) {
        r.phase = p
        setPhase(p)
      }
      if (p === 'betting') {
        const left = Math.max(0, r.startAt + BET_MS - now)
        if (timerRef.current) timerRef.current.textContent = `${(left / 1000).toFixed(1)} с`
        if (barRef.current) barRef.current.style.transform = `scaleX(${left / BET_MS})`
      }
      // Ставки закрыты и ячейка известна: крутим ленту ровно до конца прокрутки
      if (p !== 'betting' && !r.spun && r.cell !== null) {
        r.spun = true
        const left = r.startAt + BET_MS + SPIN_MS - now
        setSpinMs(Math.max(0, left - 200))
        setOffset(offsetFor(LAND_REP * N + r.cell, jitterOf(r.id)))
        if (left > 600) haptic.heavy()
        // Демо: ставки списываются, когда закрыт приём
        if (!live.current.shared) {
          const b = live.current.localBets
          const total = b.red + b.green + b.black
          if (total > 0) {
            if (live.current.spend(total, 'Рулетка')) r.charged = total
            else {
              toast(t('Не хватает баланса на ставки'), 'error')
              setLocalBets(emptyBets())
            }
          }
        }
      }
      if (p === 'result' && r.spun && !r.settled && r.cell !== null) {
        r.settled = true
        const color = ROULETTE_CELLS[r.cell]
        r.lastCell = r.cell
        setWinColor(color)
        const mine = live.current.shared
          ? live.current.snap.bets.filter((b) => b.uid === live.current.me && b.color === color).reduce((sum, b) => sum + Number(b.amount), 0)
          : r.charged > 0
            ? live.current.localBets[color]
            : 0
        const hadBets = live.current.shared ? live.current.snap.bets.some((b) => b.uid === live.current.me) : r.charged > 0
        if (mine > 0) {
          if (!live.current.shared) live.current.credit(mine * MULT[color], `${t('Рулетка')} ${fmtMult(MULT[color])}`)
          haptic.success()
          toast(t('Выигрыш {mult} на {color}', { mult: fmtMult(MULT[color]), color: t(LABEL[color]).toLowerCase() }), 'success')
        } else if (hadBets) haptic.error()
        // Выигрыш с сервера уже зачислен — забираем свежий баланс
        if (live.current.shared && hadBets) live.current.refreshServer()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shared])

  const placed = myBets.red + myBets.green + myBets.black
  const placeBet = (color: RouletteColor) => {
    if (phase !== 'betting' || pending) return
    if (bet <= 0 || (!shared && placed + bet > balanceTon + 1e-9) || (shared && bet > balanceTon + 1e-9)) {
      haptic.error()
      openSheet('deposit')
      return
    }
    haptic.tap()
    if (shared) {
      // Ставка сразу уходит на сервер и видна всем. Ключ защищает от двойного списания при повторе
      setPending(true)
      api<{ balance: string; duplicate?: boolean }>('/roulette/bet', { method: 'POST', body: { color, amount: bet.toFixed(9), key: newKey() } })
        .then((res) => {
          if (!res.duplicate) serverMove(res.balance, 'bet', `${t('Рулетка')} · ${t(LABEL[color]).toLowerCase()}`, -bet)
        })
        .catch((e) => {
          haptic.error()
          toast(String(e.message ?? e), 'error')
        })
        .finally(() => setPending(false))
      return
    }
    setLocalBets((b) => ({ ...b, [color]: b[color] + bet }))
  }

  const reelStyle: CSSProperties = {
    transform: `translate3d(${offset}px,0,0)`,
    transition: spinMs > 0 ? `transform ${spinMs}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
  }

  // Игроки по цветам: с сервером — все ставки раунда, в демо — только свои
  const players = (color: RouletteColor): RouletteBetView[] =>
    shared
      ? snap.bets.filter((b) => b.color === color)
      : localBets[color] > 0
        ? [{ uid: 0, name: t('Вы'), photo: null, color, amount: String(localBets[color]), payout: '0' }]
        : []

  return (
    <div className="screen">
      <PageHead title={t('Рулетка')} room="roulette" />

      <div className="hist-row hist-row--dots">
        {snap.history.map((h) => (
          <span key={h.id} className={`r-dot r-dot--${ROULETTE_CELLS[h.cell]}`} />
        ))}
      </div>

      <div className="r-reel" ref={reelRef}>
        <div className="r-reel__marker" />
        <div className="r-reel__track" style={reelStyle}>
          {CELLS.map((color, i) => (
            <div key={i} className={`r-cell r-cell--${color}`} style={{ width: CELL }}>
              {color === 'green' ? '◆' : ''}
            </div>
          ))}
        </div>
      </div>

      <div className="r-status">
        {shared && !connected ? (
          <div className="r-status__text">{t('Переподключаемся…')}</div>
        ) : phase === 'betting' ? (
          <>
            <div className="r-status__text">
              {t('Ставки принимаются')} · <span ref={timerRef}>10.0 с</span>
            </div>
            <div className="crash-wait__bar">
              <div ref={barRef} />
            </div>
          </>
        ) : phase === 'spinning' ? (
          <div className="r-status__text">{t('Крутим…')}</div>
        ) : (
          winColor && <div className={`r-status__text r-status__text--${winColor}`}>{t('Выпало: {color}', { color: t(LABEL[winColor]) })}</div>
        )}
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={phase !== 'betting'} />
        <div className="r-bets">
          {COLORS.map((color) => {
            const total = players(color).reduce((s, b) => s + Number(b.amount), 0)
            return (
              <button
                key={color}
                type="button"
                className={`r-bet r-bet--${color} ${winColor === color ? 'is-win' : winColor ? 'is-lose' : ''}`}
                disabled={phase !== 'betting' || pending}
                onClick={() => placeBet(color)}
              >
                <span className="r-bet__mult">{fmtMult(MULT[color])}</span>
                <span className="r-bet__label">{t(LABEL[color])}</span>
                {myBets[color] > 0 && (
                  <span className="r-bet__mine">
                    {t('Ваша')}: <Money ton={myBets[color]} size={11} />
                  </span>
                )}
                <span className="r-bet__total">
                  <Money ton={total} size={11} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="r-cols">
        {COLORS.map((color) => {
          const list = players(color)
          return (
            <div key={color} className={`r-col r-col--${color}`}>
              <div className="r-col__head">{t('{n} игроков', { n: list.length })}</div>
              {list.slice(0, 12).map((b) => {
                const mine = !shared || b.uid === me
                return (
                  <div key={`${b.uid}-${color}`} className={`r-col__row ${mine ? 'is-me' : ''}`}>
                    <Avatar name={mine ? t('Вы') : b.name} color={mine ? '#2ea7ff' : AVATAR_COLORS[Math.abs(b.uid) % AVATAR_COLORS.length]} photo={b.photo ?? undefined} size={20} />
                    <Money ton={Number(b.amount)} size={11} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {!shared && <p className="note">{t('Раунды и исходы общие для всех игроков. Ставки других игроков видны, когда сервер онлайн.')}</p>}
    </div>
  )
}
