import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useStore } from '../state/store'
import { TonIcon } from './icons'

interface Props {
  /** Ставка в TON. */
  value: number
  onChange(ton: number): void
  disabled?: boolean
}

const MIN_TON = 0.1

/** Число из того, что ввёл игрок: запятая как точка, пусто или мусор — null. */
export function parseTon(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const show = (ton: number) => String(+ton.toFixed(2))

/**
 * Поле ставки. Текст поля живёт отдельно от числа: так его можно стереть целиком и набрать заново.
 * Пока поле пустое, ставка не меняется; при уходе из поля текст выравнивается по ставке.
 */
export function BetInput({ value, onChange, disabled }: Props) {
  const { balanceTon } = useStore()
  const [text, setText] = useState(() => show(value))
  const [editing, setEditing] = useState(false)
  const set = (ton: number) => onChange(Math.max(MIN_TON, +ton.toFixed(4)))

  // Ставку поменяли кнопками ½, x2, «Макс» или снаружи — показываем её, если игрок сейчас не печатает
  useEffect(() => {
    if (!editing) setText(show(value))
  }, [value, editing])

  return (
    <div className={`bet-input ${disabled ? 'is-disabled' : ''}`}>
      <label className="bet-input__field">
        <TonIcon size={18} />
        <input
          inputMode="decimal"
          value={text}
          placeholder={show(MIN_TON)}
          disabled={disabled}
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, '')
            setText(raw)
            const n = parseTon(raw)
            if (n !== null && n > 0) onChange(n)
          }}
          onBlur={() => {
            setEditing(false)
            const n = parseTon(text)
            if (n === null || n < MIN_TON) set(n === null ? value : MIN_TON)
            setText(show(n === null ? value : Math.max(MIN_TON, n)))
          }}
          aria-label={t('Сумма ставки')}
        />
      </label>
      <div className="bet-input__chips">
        <button type="button" disabled={disabled} onClick={() => set(value / 2)}>½</button>
        <button type="button" disabled={disabled} onClick={() => set(value * 2)}>x2</button>
        <button type="button" disabled={disabled} onClick={() => set(balanceTon)}>{t('Макс')}</button>
      </div>
    </div>
  )
}
