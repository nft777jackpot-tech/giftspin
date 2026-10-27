import { useState } from 'react'
import { BetInput } from '../components/BetInput'
import { IconBomb, IconGem } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { fmtMult } from '../lib/format'
import { t } from '../lib/i18n'
import { MINES_CELLS, minesLayout, minesMultiplier } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useStore, type Roll } from '../state/store'

const PRESETS = [1, 3, 5, 10, 24]

type Phase = 'idle' | 'playing' | 'won' | 'lost'

interface Game {
  bet: number
  mines: number
  layout: number[]
  roll: Roll
}

export function Mines() {
  const { spend, credit, openSheet, roll, logRound } = useStore()
  const [bet, setBet] = useState(1)
  const [mines, setMines] = useState(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [game, setGame] = useState<Game | null>(null)
  const [opened, setOpened] = useState<number[]>([])
  const [boom, setBoom] = useState<number | null>(null)

  const count = game?.mines ?? mines
  const safeTotal = MINES_CELLS - count
  const current = minesMultiplier(count, opened.length)
  const next = opened.length < safeTotal ? minesMultiplier(count, opened.length + 1) : null
  const playing = phase === 'playing'

  const finish = (g: Game, result: string) =>
    logRound({
      game: 'mines',
      title: `${t('Мины')} · ${g.mines}`,
      nonce: g.roll.nonce,
      clientSeed: g.roll.clientSeed,
      hash: g.roll.hash,
      params: { mines: g.mines },
      result,
    })

  const start = () => {
    if (playing) return
    if (!spend(bet, t('Мины'))) {
      haptic.error()
      openSheet('deposit')
      return
    }
    haptic.tap()
    const r = roll(24)
    setGame({ bet, mines, layout: minesLayout(r.floats, mines), roll: r })
    setOpened([])
    setBoom(null)
    setPhase('playing')
  }

  const cashOut = (g: Game, openedCount: number) => {
    const m = minesMultiplier(g.mines, openedCount)
    credit(g.bet * m, `${t('Мины')} ${fmtMult(m)}`)
    haptic.success()
    toast(t('Забрали {mult}', { mult: fmtMult(m) }), 'success')
    setPhase('won')
    finish(g, fmtMult(m))
  }

  const reveal = (cell: number) => {
    if (!playing || !game || opened.includes(cell)) return
    if (game.layout.includes(cell)) {
      setBoom(cell)
      setPhase('lost')
      haptic.error()
      finish(game, '💥')
      return
    }
    const nextOpened = [...opened, cell]
    setOpened(nextOpened)
    haptic.select()
    if (nextOpened.length === safeTotal) cashOut(game, nextOpened.length)
  }

  const randomCell = () => {
    const free = Array.from({ length: MINES_CELLS }, (_, i) => i).filter((i) => !opened.includes(i))
    reveal(free[Math.floor(Math.random() * free.length)])
  }

  const ended = phase === 'won' || phase === 'lost'

  return (
    <div className="screen">
      <PageHead title={t('Мины')} />

      <div className="mines-info">
        <div>
          <span>{t('Сейчас')}</span>
          <b>{fmtMult(opened.length ? current : 1)}</b>
        </div>
        <div>
          <span>{t('Следующая клетка')}</span>
          <b>{next ? fmtMult(next) : '—'}</b>
        </div>
        <div>
          <span>{t('Клеток открыто')}</span>
          <b>
            {opened.length} / {safeTotal}
          </b>
        </div>
      </div>

      <div className={`mines-grid ${phase === 'lost' ? 'is-lost' : ''}`}>
        {Array.from({ length: MINES_CELLS }, (_, i) => {
          const isOpen = opened.includes(i)
          const isMine = !!game?.layout.includes(i)
          const show = isOpen || (ended && game)
          return (
            <button
              key={i}
              type="button"
              className={`mine-cell ${isOpen ? 'is-open' : ''} ${show ? (isMine ? 'is-mine' : 'is-gem') : ''} ${boom === i ? 'is-boom' : ''} ${ended && !isOpen ? 'is-dim' : ''}`}
              disabled={!playing || isOpen}
              onClick={() => reveal(i)}
              aria-label={t('Клетка {n}', { n: i + 1 })}
            >
              {show && (isMine ? <IconBomb size={26} /> : <IconGem size={24} />)}
            </button>
          )
        })}
        {phase === 'won' && game && (
          <div className="mines-result">
            <b>{fmtMult(current)}</b>
            <Money ton={game.bet * current} size={16} sign />
          </div>
        )}
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={playing} />
        <div className="mines-count">
          <span className="muted small">{t('Мин на поле')}</span>
          <div className="chips-row">
            {PRESETS.map((n) => (
              <button key={n} type="button" className={`chip ${mines === n ? 'is-active' : ''}`} disabled={playing} onClick={() => setMines(n)}>
                {n}
              </button>
            ))}
            <div className="stepper">
              <button type="button" disabled={playing || mines <= 1} onClick={() => setMines((m) => m - 1)} aria-label="−">
                −
              </button>
              <span>{mines}</span>
              <button type="button" disabled={playing || mines >= 24} onClick={() => setMines((m) => m + 1)} aria-label="+">
                +
              </button>
            </div>
          </div>
        </div>
        {playing && game ? (
          <div className="row-2">
            <button type="button" className="btn btn--ghost btn--lg" onClick={randomCell}>
              {t('Случайная')}
            </button>
            <button type="button" className="btn btn--success btn--lg" disabled={!opened.length} onClick={() => cashOut(game, opened.length)}>
              {t('Забрать')} <Money ton={game.bet * current} size={15} />
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
            {ended ? t('Ещё раз') : t('Начать игру')}
          </button>
        )}
      </div>

      <div className="mult-strip">
        {Array.from({ length: Math.min(safeTotal, 24) }, (_, i) => i + 1).map((k) => (
          <span key={k} className={`mult-strip__item ${k === opened.length ? 'is-current' : k < opened.length ? 'is-past' : ''}`}>
            {fmtMult(minesMultiplier(count, k))}
          </span>
        ))}
      </div>

      <p className="note">{t('Множитель после каждой клетки = RTP ÷ вероятность открыть столько клеток без мины. Мины расставляются до первого хода из ваших сидов.')}</p>
    </div>
  )
}
