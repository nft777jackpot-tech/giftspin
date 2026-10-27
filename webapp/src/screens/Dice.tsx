import { useEffect, useRef, useState } from 'react'
import { BetInput } from '../components/BetInput'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { fmtMult, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { DICE_MAX_CHANCE, DICE_MIN_CHANCE, diceMultiplier, diceRoll, diceWin } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

const ROLL_MS = 650

interface Result {
  roll: number
  win: boolean
}

export function Dice() {
  const { playGame, openSheet } = useStore()
  const [bet, setBet] = useState(1)
  const [chance, setChance] = useState(0.5)
  const [over, setOver] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [last, setLast] = useState<Result | null>(null)
  const [recent, setRecent] = useState<Result[]>([])
  const [shown, setShown] = useState(50)
  const shownRef = useRef(50)
  const rafRef = useRef(0)

  const mult = diceMultiplier(chance)
  const edge = chance * 100
  const threshold = over ? 100 - edge : edge

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Число на табло доезжает до результата, как будто кубик ещё катится
  const animateTo = (target: number, done: () => void) => {
    const from = shownRef.current
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ROLL_MS)
      const v = from + (target - from) * (1 - (1 - k) ** 3)
      shownRef.current = v
      setShown(v)
      if (k < 1) rafRef.current = requestAnimationFrame(step)
      else done()
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const play = async () => {
    if (rolling) return
    setRolling(true)
    setLast(null)
    const outcome = await playGame({
      kind: 'dice',
      bet,
      label: t('Дайс'),
      roundTitle: `${t('Дайс')} · ${over ? '>' : '<'} ${threshold.toFixed(2)}`,
      params: { chance, over: over ? 1 : 0 },
      floats: 1,
      local: (f) => {
        const value = diceRoll(f[0])
        const win = diceWin(value, chance, over)
        return { multiplier: win ? mult : 0, result: value.toFixed(2), win, extra: { roll: value } }
      },
    })
    if (outcome === 'insufficient') {
      setRolling(false)
      haptic.error()
      openSheet('deposit')
      return
    }
    if (!outcome) {
      setRolling(false)
      return
    }
    haptic.tap()
    const roll = outcome.fields.roll as number
    animateTo(roll, () => {
      const res = { roll, win: outcome.win }
      setLast(res)
      setRecent((list) => [res, ...list].slice(0, 16))
      setRolling(false)
      outcome.reveal()
      if (outcome.win) haptic.success()
      else haptic.error()
    })
  }

  const setChancePct = (pct: number) => {
    if (Number.isNaN(pct)) return
    setChance(Math.min(DICE_MAX_CHANCE, Math.max(DICE_MIN_CHANCE, Math.round(pct * 100) / 10000)))
  }

  return (
    <div className="screen">
      <PageHead title={t('Дайс')} />

      <div className="hist-row">
        {recent.map((r, i) => (
          <span key={i} className={`hist-chip ${r.win ? 'hist-chip--win' : 'hist-chip--grey'}`}>
            {r.roll.toFixed(2)}
          </span>
        ))}
        {!recent.length && <span className="muted small">{t('Бросков пока не было')}</span>}
      </div>

      <div className={`dice-board ${last ? (last.win ? 'is-win' : 'is-lose') : ''}`}>
        <div className="dice-board__value">{shown.toFixed(2)}</div>
        <div className="dice-board__label">
          {last ? (last.win ? t('Выигрыш') : t('Мимо')) : over ? t('Нужно больше {n}', { n: threshold.toFixed(2) }) : t('Нужно меньше {n}', { n: threshold.toFixed(2) })}
        </div>
        <div className="dice-track">
          <div
            className="dice-track__win"
            style={over ? { left: `${100 - edge}%`, right: 0 } : { left: 0, right: `${100 - edge}%` }}
          />
          <div className="dice-track__marker" style={{ left: `${shown}%` }} />
          <input
            type="range"
            className="dice-track__range"
            min={over ? 100 - DICE_MAX_CHANCE * 100 : DICE_MIN_CHANCE * 100}
            max={over ? 100 - DICE_MIN_CHANCE * 100 : DICE_MAX_CHANCE * 100}
            step={0.5}
            value={threshold}
            disabled={rolling}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setChancePct(over ? 100 - v : v)
            }}
            aria-label={t('Порог')}
          />
        </div>
        <div className="dice-scale">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      <div className="seg">
        <button type="button" className={!over ? 'is-active' : ''} disabled={rolling} onClick={() => setOver(false)}>
          {t('Меньше')}
        </button>
        <button type="button" className={over ? 'is-active' : ''} disabled={rolling} onClick={() => setOver(true)}>
          {t('Больше')}
        </button>
      </div>

      <div className="dice-fields">
        <label className="dice-field">
          <span>{t('Шанс')}</span>
          <div>
            <input
              inputMode="decimal"
              value={fmtNum(chance * 100, 2)}
              onChange={(e) => setChancePct(parseFloat(e.target.value.replace(',', '.')))}
              disabled={rolling}
            />
            %
          </div>
        </label>
        <div className="dice-field">
          <span>{t('Множитель')}</span>
          <div>{fmtMult(mult)}</div>
        </div>
        <div className="dice-field">
          <span>{t('Выигрыш')}</span>
          <div>
            <Money ton={bet * mult} size={13} />
          </div>
        </div>
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={rolling} />
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={rolling} onClick={play}>
          {rolling ? t('Бросаем…') : t('Бросить')}
        </button>
      </div>

      <p className="note">
        {t('Бросок от 0.00 до 99.99. Множитель = RTP ÷ шанс, поэтому при любом пороге игра возвращает в среднем одинаковую долю ставок.')}
      </p>
    </div>
  )
}
