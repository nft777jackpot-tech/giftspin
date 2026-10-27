import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { BetInput } from '../components/BetInput'
import { GiftCard } from '../components/GiftCard'
import { GiftImg } from '../components/GiftImg'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { RTP } from '../config'
import { getGift } from '../data/gifts'
import { fmtChance } from '../lib/format'
import { jackpotPayout } from '../lib/rtp'
import { getMe, haptic } from '../lib/telegram'
import { useStore } from '../state/store'

const COUNTDOWN_MS = 20000
const SPIN_MS = 6500
const RESULT_MS = 4500
const SIZE = 260
const C = SIZE / 2
const R_OUT = 124
const R_IN = 92

type Phase = 'waiting' | 'countdown' | 'spinning' | 'result'

interface Entry {
  id: string
  name: string
  color: string
  /** Вклад в TON. */
  amount: number
  gifts: string[]
  me?: boolean
}

function polar(angle: number, r: number) {
  const a = ((angle - 90) * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

function arcPath(a0: number, a1: number) {
  const [x0, y0] = polar(a0, R_OUT)
  const [x1, y1] = polar(a1, R_OUT)
  const [x2, y2] = polar(a1, R_IN)
  const [x3, y3] = polar(a0, R_IN)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3} Z`
}

export function Jackpot() {
  const { spend, credit, openSheet, inventory, removeItems } = useStore()
  const me = getMe()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [roundNo, setRoundNo] = useState(18421)
  const [entries, setEntries] = useState<Entry[]>([])
  const [rot, setRot] = useState(0)
  const [winner, setWinner] = useState<Entry | null>(null)
  const [bet, setBet] = useState(1)
  const [giftSheet, setGiftSheet] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const timerRef = useRef<HTMLDivElement>(null)
  const maybeStartRef = useRef(() => {})
  const round = useRef({ phase: 'waiting' as Phase, since: 0 })
  const live = useRef({ entries, credit, rot })
  live.current = { entries, credit, rot }

  const pot = entries.reduce((s, e) => s + e.amount, 0)
  const myEntry = entries.find((e) => e.me)
  const locked = phase === 'spinning' || phase === 'result'

  useEffect(() => {
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))

    // Без ботов: раунд крутится, когда наберётся 2+ реальных игрока
    const addBot = () => {}

    const maybeStart = () => {
      const r = round.current
      if (r.phase === 'waiting' && live.current.entries.length >= 2) {
        r.phase = 'countdown'
        r.since = performance.now()
        setPhase('countdown')
        later(spin, COUNTDOWN_MS)
      }
    }

    const spin = () => {
      const list = live.current.entries
      const total = list.reduce((s, e) => s + e.amount, 0)
      // Победитель выбирается пропорционально вкладу: случайная точка на круге
      const point = Math.random() * total
      let acc = 0
      let win = list[0]
      for (const e of list) {
        acc += e.amount
        if (point < acc) {
          win = e
          break
        }
      }
      const angle = (point / total) * 360
      const cur = live.current.rot
      round.current.phase = 'spinning'
      setPhase('spinning')
      setRot(Math.ceil(cur / 360) * 360 + 360 * 6 - angle)
      haptic.heavy()
      later(() => finish(win, total), SPIN_MS)
    }

    const finish = (win: Entry, total: number) => {
      round.current.phase = 'result'
      setPhase('result')
      setWinner(win)
      if (win.me) {
        live.current.credit(jackpotPayout(total), 'PvP-джекпот')
        haptic.success()
        toast('Вы забрали джекпот!', 'success')
      }
      later(reset, RESULT_MS)
    }

    const reset = () => {
      round.current.phase = 'waiting'
      setPhase('waiting')
      setWinner(null)
      setEntries([])
      live.current.entries = []
      setRot(0)
      setRoundNo((n) => n + 1)
      later(addBot, 800)
    }

    maybeStartRef.current = maybeStart
    later(addBot, 500)
    later(addBot, 1400)

    let raf = 0
    const tick = (now: number) => {
      const r = round.current
      if (timerRef.current) {
        if (r.phase === 'countdown') {
          const left = Math.max(0, COUNTDOWN_MS - (now - r.since))
          timerRef.current.textContent = `${Math.ceil(left / 1000)} с`
        } else if (r.phase === 'waiting') {
          timerRef.current.textContent = 'ждём игроков'
        } else if (r.phase === 'spinning') {
          timerRef.current.textContent = 'крутим…'
        } else {
          timerRef.current.textContent = ''
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
    }
  }, [])

  const join = (amount: number, gifts: string[]) => {
    setEntries((list) => {
      const mine = list.find((e) => e.me)
      const next = mine
        ? list.map((e) => (e.me ? { ...e, amount: e.amount + amount, gifts: [...e.gifts, ...gifts] } : e))
        : [...list, { id: 'me', name: me.name, color: '#eef2f8', amount, gifts, me: true }]
      live.current.entries = next
      return next
    })
    // Если игрок стал вторым участником, раунд стартует от его ставки
    window.setTimeout(() => maybeStartRef.current(), 0)
    haptic.tap()
  }

  const joinTon = () => {
    if (locked) return
    if (!spend(bet, 'PvP-джекпот')) {
      haptic.error()
      openSheet('deposit')
      return
    }
    join(bet, [])
  }

  const pickedItems = inventory.filter((i) => picked.includes(i.uid))
  const pickedValue = pickedItems.reduce((s, i) => s + getGift(i.giftId).price, 0)

  const joinGifts = () => {
    if (locked || !pickedItems.length) return
    removeItems(picked)
    join(
      pickedValue,
      pickedItems.map((i) => i.giftId),
    )
    setPicked([])
    setGiftSheet(false)
  }

  let a0 = 0
  const segments = entries.map((e) => {
    const sweep = pot > 0 ? (e.amount / pot) * 360 : 0
    const seg = { e, a0, a1: a0 + sweep }
    a0 += sweep
    return seg
  })

  return (
    <div className="screen">
      <PageHead title="PvP-джекпот" right={<span className="muted small">Раунд #{roundNo}</span>} />

      <div className="jp-wheel">
        <div className="jp-wheel__pointer" />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="jp-wheel__svg"
          style={{
            transform: `rotate(${rot}deg)`,
            transition: phase === 'spinning' ? `transform ${SPIN_MS - 300}ms cubic-bezier(0.12, 0.65, 0.1, 1)` : 'none',
          }}
          aria-hidden
        >
          <circle cx={C} cy={C} r={(R_OUT + R_IN) / 2} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={R_OUT - R_IN} />
          {segments.length === 1 ? (
            <circle cx={C} cy={C} r={(R_OUT + R_IN) / 2} fill="none" stroke={segments[0].e.color} strokeWidth={R_OUT - R_IN} />
          ) : (
            segments.map(({ e, a0, a1 }) => (
              <path
                key={e.id}
                d={arcPath(a0, a1)}
                fill={e.color}
                className={winner && winner.id !== e.id ? 'is-faded' : ''}
                stroke="#0a0d13"
                strokeWidth={2}
              />
            ))
          )}
        </svg>
        <div className="jp-wheel__center">
          {winner ? (
            <>
              <Avatar name={winner.name} color={winner.color} size={44} />
              <div className="jp-wheel__winner">{winner.me ? 'Вы победили!' : winner.name}</div>
              <Money ton={jackpotPayout(pot)} size={14} />
            </>
          ) : (
            <>
              <div className="jp-wheel__label">Банк</div>
              <Money ton={pot} size={20} className="jp-wheel__pot" />
              <div ref={timerRef} className="jp-wheel__timer" />
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={locked} />
        <div className="row-2">
          <button type="button" className="btn btn--primary btn--lg" disabled={locked} onClick={joinTon}>
            Внести <Money ton={bet} size={16} />
          </button>
          <button type="button" className="btn btn--ghost btn--lg" disabled={locked} onClick={() => setGiftSheet(true)}>
            Подарки
          </button>
        </div>
        {myEntry && (
          <div className="jp-mine">
            Ваш шанс <b>{fmtChance(myEntry.amount / pot)}</b> · вклад <Money ton={myEntry.amount} size={12} />
          </div>
        )}
      </div>

      <div className="panel players">
        <div className="players__head">
          <span>Участники · {entries.length}</span>
          <span className="muted small">Комиссия {Math.round((1 - RTP) * 100)}%</span>
        </div>
        {entries.length === 0 && <div className="empty empty--inline">Пока никого. Будьте первым!</div>}
        {[...entries]
          .sort((a, b) => b.amount - a.amount)
          .map((e) => (
            <div key={e.id} className={`player-row ${e.me ? 'is-me' : ''} ${winner?.id === e.id ? 'is-won' : ''}`}>
              <span className="player-row__swatch" style={{ background: e.color }} />
              <Avatar name={e.name} color={e.color} size={28} photo={e.me ? me.photo : undefined} />
              <span className="player-row__name">
                {e.me ? 'Вы' : e.name}
                {e.gifts.length > 0 && (
                  <span className="player-row__gifts">
                    {e.gifts.slice(0, 3).map((g, i) => (
                      <GiftImg key={i} giftId={g} size={18} />
                    ))}
                  </span>
                )}
              </span>
              <Money ton={e.amount} size={12} />
              <span className="player-row__result">{fmtChance(e.amount / pot)}</span>
            </div>
          ))}
      </div>

      <p className="note">
        Победитель забирает весь банк за вычетом комиссии. Шанс равен доле вашего вклада. Подарки оцениваются по
        минимальной цене коллекции.
      </p>

      <Sheet open={giftSheet} title="Внести подарки" onClose={() => setGiftSheet(false)}>
        {inventory.length ? (
          <>
            <div className="gift-grid">
              {inventory.map((i) => (
                <GiftCard
                  key={i.uid}
                  giftId={i.giftId}
                  num={i.num}
                  selected={picked.includes(i.uid)}
                  onClick={() => {
                    haptic.select()
                    setPicked((p) => (p.includes(i.uid) ? p.filter((x) => x !== i.uid) : [...p, i.uid]))
                  }}
                />
              ))}
            </div>
            <div className="sheet__footer">
              <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!picked.length || locked} onClick={joinGifts}>
                Внести {picked.length || ''} на <Money ton={pickedValue} size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="empty">В инвентаре нет подарков</div>
        )}
      </Sheet>
    </div>
  )
}
