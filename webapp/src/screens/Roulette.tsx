import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '../components/Avatar'
import { BetInput } from '../components/BetInput'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { type FakePlayer } from '../data/players'
import { fmtMult } from '../lib/format'
import { ROULETTE_CELLS, rouletteCell, rouletteMultiplier, type RouletteColor } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

const CELL = 58
const GAP = 6
const STEP = CELL + GAP
const REPS = 10
const REST_REP = 2
const LAND_REP = 8
const BET_MS = 10000
const SPIN_MS = 5400
const RESULT_MS = 3000

const CELLS = Array.from({ length: REPS }, () => ROULETTE_CELLS).flat()
const N = ROULETTE_CELLS.length
const COLORS: RouletteColor[] = ['red', 'green', 'black']
const LABEL: Record<RouletteColor, string> = { red: 'Красное', green: 'Зелёное', black: 'Чёрное' }
const MULT: Record<RouletteColor, number> = {
  red: rouletteMultiplier('red'),
  green: rouletteMultiplier('green'),
  black: rouletteMultiplier('black'),
}

type Phase = 'betting' | 'spinning' | 'result'
type Bets = Record<RouletteColor, number>

interface BotBet extends FakePlayer {
  amount: number
}

const emptyBets = (): Bets => ({ red: 0, green: 0, black: 0 })
const emptyBots = (): Record<RouletteColor, BotBet[]> => ({ red: [], green: [], black: [] })

export function Roulette() {
  const { playGame, balanceTon, openSheet } = useStore()
  const [phase, setPhase] = useState<Phase>('betting')
  const [bet, setBet] = useState(1)
  const [myBets, setMyBets] = useState<Bets>(emptyBets)
  const [bots, setBots] = useState(emptyBots)
  const [results, setResults] = useState<number[]>(() => Array.from({ length: 14 }, () => Math.floor(Math.random() * N)))
  const [winColor, setWinColor] = useState<RouletteColor | null>(null)
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)

  const reelRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // reveal применяет выигрыш после остановки ленты; payout — сколько вернулось игроку
  const round = useRef({ phase: 'betting' as Phase, since: performance.now(), idx: 0, jitter: 0, reveal: null as (() => void) | null, payout: 0 })
  const live = useRef({ myBets, playGame })
  live.current = { myBets, playGame }

  const offsetFor = (i: number, jitter: number) => {
    const w = reelRef.current?.clientWidth ?? 360
    return -(i * STEP + CELL / 2 - w / 2 + jitter)
  }

  useEffect(() => {
    const timers: number[] = []
    let alive = true
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))

    const startBetting = () => {
      const r = round.current
      // Без анимации переставляем ленту на тот же сектор ближе к началу
      setAnimate(false)
      setOffset(offsetFor(REST_REP * N + r.idx, r.jitter))
      r.phase = 'betting'
      r.since = performance.now()
      setPhase('betting')
      setWinColor(null)
      setMyBets(emptyBets())
      live.current.myBets = emptyBets()
      setBots(emptyBots())
      later(startSpin, BET_MS)
    }

    const startSpin = async () => {
      const r = round.current
      r.phase = 'spinning'
      r.reveal = null
      r.payout = 0
      setPhase('spinning')
      // Без ставок лента крутится просто так. Со ставками ячейку выбирает сервер (или локальный сид в демо)
      let idx = Math.floor(Math.random() * N)
      const bets = live.current.myBets
      const total = bets.red + bets.green + bets.black
      if (total > 0) {
        const outcome = await live.current.playGame({
          kind: 'roulette',
          bet: total,
          label: 'Рулетка',
          roundTitle: `Рулетка · ${COLORS.filter((c) => bets[c] > 0).map((c) => LABEL[c].toLowerCase()).join(', ')}`,
          params: { red: bets.red.toFixed(9), green: bets.green.toFixed(9), black: bets.black.toFixed(9) },
          floats: 1,
          local: ([u]) => {
            const cell = rouletteCell(u)
            const color = ROULETTE_CELLS[cell]
            const payout = bets[color] * MULT[color]
            return { multiplier: payout / total, result: color, win: payout > 0, extra: { cell } }
          },
        })
        if (!alive) return
        if (outcome && outcome !== 'insufficient') {
          idx = outcome.fields.cell as number
          r.reveal = outcome.reveal
          r.payout = total * outcome.multiplier
        } else {
          // Ставки не приняты: снимаем их с экрана, баланс не тронут
          if (outcome === 'insufficient') toast('Не хватает баланса на ставки', 'error')
          setMyBets(emptyBets())
          live.current.myBets = emptyBets()
        }
      }
      r.idx = idx
      r.jitter = (Math.random() - 0.5) * CELL * 0.8
      setAnimate(true)
      setOffset(offsetFor(LAND_REP * N + r.idx, r.jitter))
      haptic.heavy()
      later(showResult, SPIN_MS)
    }

    const showResult = () => {
      const r = round.current
      r.phase = 'result'
      const color = ROULETTE_CELLS[r.idx]
      setPhase('result')
      setWinColor(color)
      setResults((res) => [r.idx, ...res].slice(0, 20))
      r.reveal?.()
      if (r.payout > 0) {
        haptic.success()
        toast(`Выигрыш ${fmtMult(MULT[color])} на ${LABEL[color].toLowerCase()}`, 'success')
      } else if (r.reveal) {
        haptic.error()
      }
      later(startBetting, RESULT_MS)
    }

    // Лента стартует на последнем результате из истории
    round.current.idx = results[0]
    startBetting()

    let raf = 0
    const tick = (now: number) => {
      const r = round.current
      if (r.phase === 'betting') {
        const left = Math.max(0, BET_MS - (now - r.since))
        if (timerRef.current) timerRef.current.textContent = `${(left / 1000).toFixed(1)} с`
        if (barRef.current) barRef.current.style.transform = `scaleX(${left / BET_MS})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      alive = false
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Ставки копятся до запуска и списываются одним разом, когда лента начинает крутиться
  const placed = myBets.red + myBets.green + myBets.black
  const placeBet = (color: RouletteColor) => {
    if (phase !== 'betting') return
    if (bet <= 0 || placed + bet > balanceTon + 1e-9) {
      haptic.error()
      openSheet('deposit')
      return
    }
    haptic.tap()
    setMyBets((b) => {
      const next = { ...b, [color]: b[color] + bet }
      live.current.myBets = next
      return next
    })
  }

  const reelStyle: CSSProperties = {
    transform: `translate3d(${offset}px,0,0)`,
    transition: animate ? `transform ${SPIN_MS - 200}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
  }

  return (
    <div className="screen">
      <PageHead title="Рулетка" />

      <div className="hist-row hist-row--dots">
        {results.map((idx, i) => (
          <span key={i} className={`r-dot r-dot--${ROULETTE_CELLS[idx]}`} />
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
        {phase === 'betting' && (
          <>
            <div className="r-status__text">
              Ставки принимаются · <span ref={timerRef}>10.0 с</span>
            </div>
            <div className="crash-wait__bar">
              <div ref={barRef} />
            </div>
          </>
        )}
        {phase === 'spinning' && <div className="r-status__text">Крутим…</div>}
        {phase === 'result' && winColor && (
          <div className={`r-status__text r-status__text--${winColor}`}>Выпало: {LABEL[winColor]}</div>
        )}
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={phase !== 'betting'} />
        <div className="r-bets">
          {COLORS.map((color) => {
            const total = bots[color].reduce((s, b) => s + b.amount, 0) + myBets[color]
            return (
              <button
                key={color}
                type="button"
                className={`r-bet r-bet--${color} ${winColor === color ? 'is-win' : winColor ? 'is-lose' : ''}`}
                disabled={phase !== 'betting'}
                onClick={() => placeBet(color)}
              >
                <span className="r-bet__mult">{fmtMult(MULT[color])}</span>
                <span className="r-bet__label">{LABEL[color]}</span>
                {myBets[color] > 0 && (
                  <span className="r-bet__mine">
                    Ваша: <Money ton={myBets[color]} size={11} />
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
        {COLORS.map((color) => (
          <div key={color} className={`r-col r-col--${color}`}>
            <div className="r-col__head">{bots[color].length + (myBets[color] > 0 ? 1 : 0)} игроков</div>
            {myBets[color] > 0 && (
              <div className="r-col__row is-me">
                <Avatar name="Вы" color="#2ea7ff" size={20} />
                <Money ton={myBets[color]} size={11} />
              </div>
            )}
            {bots[color].slice(0, 8).map((b) => (
              <div key={b.id} className="r-col__row">
                <Avatar name={b.name} color={b.color} size={20} />
                <Money ton={b.amount} size={11} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
