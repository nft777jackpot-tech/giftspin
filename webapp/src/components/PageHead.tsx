import type { ReactNode } from 'react'
import { t } from '../lib/i18n'
import { tg, useBackButton } from '../lib/telegram'
import { useNav } from '../state/nav'
import { IconBack } from './icons'

export function PageHead({ title, right }: { title: string; right?: ReactNode }) {
  const { back } = useNav()
  useBackButton(back)
  return (
    <div className="page-head">
      {/* В Telegram есть нативная кнопка «Назад», в браузере рисуем свою */}
      {!tg && (
        <button type="button" className="icon-btn" onClick={back} aria-label={t('Назад')}>
          <IconBack size={20} />
        </button>
      )}
      <h1 className="page-head__title">{title}</h1>
      {right && <div className="page-head__right">{right}</div>}
    </div>
  )
}
