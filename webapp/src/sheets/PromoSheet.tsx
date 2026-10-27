import { useState } from 'react'
import { TonIcon } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { fmtAmount } from '../lib/format'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

export function PromoSheet() {
  const { sheet, openSheet, activatePromo, promo, promos } = useStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const close = () => {
    openSheet(null)
    setError('')
  }
  const active = promos.find((p) => p.code === promo)

  const submit = () => {
    const res = activatePromo(code)
    if (res === 'ok') {
      haptic.success()
      toast(t('Промокод активирован'), 'success')
      setCode('')
      close()
      return
    }
    haptic.error()
    setError(
      res === 'unknown' ? t('Такого промокода нет') : res === 'used' ? t('Этот промокод уже активирован') : t('На аккаунт можно активировать один промокод'),
    )
  }

  return (
    <Sheet open={sheet === 'promo'} title={t('Промокод')} onClose={close}>
      {active ? (
        <div className="promo-active">
          <b>{active.code}</b>
          <span className="muted">{t('Бонус получен')}</span>
          <span className="task__reward">
            <TonIcon size={14} /> {fmtAmount(active.reward)}
          </span>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span>{t('Код от блогера или канала')}</span>
            <input
              className="input mono"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              placeholder="WELCOME"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={code.trim().length < 3} onClick={submit}>
            {t('Активировать')}
          </button>
          <p className="note">{t('Один промокод на аккаунт. Бонус приходит в TON и сразу доступен для игры.')}</p>
        </div>
      )}
    </Sheet>
  )
}
