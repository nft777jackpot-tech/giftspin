import type { CSSProperties } from 'react'
import type { CaseDef } from '../data/cases'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useNav } from '../state/nav'
import { GiftImg } from './GiftImg'
import { Money } from './Money'

/** Имя кейса: встроенные переводятся, созданные в админке показываются как есть. */
export const caseName = (c: CaseDef) => (c.custom ? c.name : t(c.name))

export function CaseCard({ c, wide }: { c: CaseDef; wide?: boolean }) {
  const { open } = useNav()
  return (
    <button
      type="button"
      className={`case-card ${wide ? 'case-card--wide' : ''} ${c.event ? 'case-card--event' : ''}`}
      style={{ '--accent': c.accent } as CSSProperties}
      onClick={() => {
        haptic.tap()
        open({ name: 'case', id: c.id })
      }}
    >
      {c.tag && <span className="case-card__tag">{c.custom ? c.tag : t(c.tag)}</span>}
      <div className="case-card__art">
        <div className="case-card__glow" />
        <div className="case-card__box">
          <GiftImg giftId={c.cover} />
        </div>
      </div>
      <div className="case-card__name">{caseName(c)}</div>
      <div className="case-card__price">
        <Money ton={c.price} size={14} />
      </div>
    </button>
  )
}
