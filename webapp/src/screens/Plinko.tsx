import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BetInput } from '../components/BetInput'
import { PageHead } from '../components/PageHead'
import { fmtMult } from '../lib/format'
import { t, tk } from '../lib/i18n'
import { PLINKO_ROWS, plinkoMultipliers, plinkoPath, type PlinkoRisk, type PlinkoRows } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

const RISKS: { id: PlinkoRisk; label: string }[] = [
  { id: 'low', label: tk('Низкий') },
  { id: 'mid', label: tk('Средний') },
  { id: 'high', label: tk('Высокий') },
]
const TOP = 7
const BOTTOM = 86
const MAX_BALLS = 12

interface Ball {
  id: number
  frames: Keyframe[]
  duration: number
  slot: number
  mult: number
  /** Применить выигрыш и записать раунд — когда шарик долетит до лунки. */
  reveal(): void
}

let ballSeq = 0

function geometry(rows: number) {
  const dx = 100 / (rows + 2)
  const dy = (BOTTOM - TOP) / rows
  return { dx, dy, rowY: (i: number) => TOP + i * dy, slotX: (k: number) => 50 + (k - rows / 2) * dx }
}

function slotTone(m: number) {
  if (m >= 10) return 'hot'
  if (m >= 2) return 'warm'
  if (m >= 1) return 'ok'
  return 'cold'
}

function BallView({ ball, onDone }: { ball: Ball; onDone(b: Ball): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const anim = ref.current!.animate(ball.frames, { duration: ball.duration, fill: 'forwards' })
    anim.onfinish = () => onDone(ball)
    return () => anim.cancel()
    // Шарик анимируется один раз при появлении
  }, [])
  return <div ref={ref} className="plinko-ball" />
}

export function Plinko() {
  const { playGame, openSheet } = useStore()
  const [bet, setBet] = useState(0.5)
  const [rows, setRows] = useState<PlinkoRows>(12)
  const [risk, setRisk] = useState<PlinkoRisk>('mid')
  const [balls, setBalls] = useState<Ball[]>([])
  const [hits, setHits] = useState<Record<number, number>>({})
  const [recent, setRecent] = useState<number[]>([])

  const mults = useMemo(() => plinkoMultipliers(rows, risk), [rows, risk])
  const g = geometry(rows)
  const busy = balls.length > 0

  const drop = async () => {
    if (balls.length >= MAX_BALLS) return
    const outcome = await playGame({
      kind: 'plinko',
      bet,
      label: t('Плинко'),
      roundTitle: `${t('Плинко')} · ${rows} · ${t(RISKS.find((x) => x.id === risk)!.label)}`,
      params: { rows, risk },
      floats: rows,
      local: (f) => {
        const path = plinkoPath(f, rows)
        const slot = path.filter(Boolean).length
        const mult = mults[slot]
        return { multiplier: mult, result: fmtMult(mult), win: mult >= 1, extra: { path, slot } }
      },
    })
    if (outcome === 'insufficient') {
      haptic.error()
      openSheet('deposit')
      return
    }
    if (!outcome) return
    haptic.tap()
    const path = outcome.fields.path as boolean[]
    const slot = outcome.fields.slot as number
    const mult = outcome.multiplier

    // Шарик бьётся о колышек каждого ряда и уходит на полшага влево или вправо
    const frames: Keyframe[] = [{ left: '50%', top: `${TOP - 6}%`, easing: 'cubic-bezier(.45,0,1,1)' }]
    let rights = 0
    for (let i = 0; i < rows; i++) {
      frames.push({ left: `${50 + (rights - i / 2) * g.dx}%`, top: `${g.rowY(i) - 2.2}%`, easing: 'cubic-bezier(.3,.6,.6,1)' })
      if (path[i]) rights++
    }
    frames.push({ left: `${g.slotX(slot)}%`, top: `${BOTTOM + 3}%` })

    setBalls((list) => [...list, { id: ++ballSeq, frames, duration: 150 * rows + 250, slot, mult, reveal: outcome.reveal }])
  }

  const land = (b: Ball) => {
    setBalls((list) => list.filter((x) => x.id !== b.id))
    setHits((h) => ({ ...h, [b.slot]: Date.now() }))
    setRecent((list) => [b.mult, ...list].slice(0, 14))
    b.reveal()
    if (b.mult >= 2) haptic.success()
    else haptic.select()
  }

  return (
    <div className="screen">
      <PageHead title={t('Плинко')} />

      <div className="hist-row">
        {recent.map((m, i) => (
          <span key={i} className={`hist-chip plinko-tone--${slotTone(m)}`}>
            {fmtMult(m)}
          </span>
        ))}
        {!recent.length && <span className="muted small">{t('Бросьте первый шарик')}</span>}
      </div>

      <div className="plinko-board">
        {Array.from({ length: rows }, (_, i) =>
          Array.from({ length: i + 3 }, (_, j) => (
            <span
              key={`${i}-${j}`}
              className="plinko-peg"
              style={{ left: `${50 + (j - (i + 2) / 2) * g.dx}%`, top: `${g.rowY(i)}%` }}
            />
          )),
        )}
        {balls.map((b) => (
          <BallView key={b.id} ball={b} onDone={land} />
        ))}
        <div className="plinko-slots" style={{ left: `${g.slotX(0) - g.dx / 2}%`, right: `${g.slotX(0) - g.dx / 2}%` }}>
          {mults.map((m, k) => (
            <span
              key={`${rows}-${risk}-${k}-${hits[k] ?? 0}`}
              className={`plinko-slot plinko-tone--${slotTone(m)} ${hits[k] ? 'is-hit' : ''}`}
            >
              {m >= 100 ? Math.round(m) : m}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} />
        <div className="seg">
          {RISKS.map((r) => (
            <button key={r.id} type="button" className={risk === r.id ? 'is-active' : ''} disabled={busy} onClick={() => setRisk(r.id)}>
              {t(r.label)}
            </button>
          ))}
        </div>
        <div className="seg">
          {PLINKO_ROWS.map((n) => (
            <button key={n} type="button" className={rows === n ? 'is-active' : ''} disabled={busy} onClick={() => setRows(n)}>
              {t('{n} рядов', { n })}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={balls.length >= MAX_BALLS} onClick={drop}>
          {t('Бросить шарик')}
        </button>
      </div>

      <p className="note">
        {t('Шарик на каждом ряду с равной вероятностью уходит влево или вправо. Множители лунок подобраны так, чтобы средний возврат был равен RTP.')}
      </p>
    </div>
  )
}
