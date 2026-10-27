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

export function BetInput({ value, onChange, disabled }: Props) {
  const { balanceTon } = useStore()
  const shown = +value.toFixed(2)
  const set = (ton: number) => onChange(Math.max(MIN_TON, +ton.toFixed(4)))

  return (
    <div className={`bet-input ${disabled ? 'is-disabled' : ''}`}>
      <label className="bet-input__field">
        <TonIcon size={18} />
        <input
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            if (!Number.isNaN(n)) onChange(n)
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
