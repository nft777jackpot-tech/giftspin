import { CaseCard } from '../components/CaseCard'
import { t } from '../lib/i18n'
import { useStore } from '../state/store'

export function Cases() {
  const { cases } = useStore()
  const events = cases.filter((c) => c.event)
  const regular = cases.filter((c) => !c.event)
  return (
    <div className="screen">
      <h1 className="screen-title">{t('Кейсы')}</h1>
      <p className="screen-sub">{t('Шансы каждого приза видны внутри кейса')}</p>
      {events.length > 0 && (
        <>
          <div className="section-title">{t('Праздничные')}</div>
          <div className="cases-grid">
            {events.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
          <div className="section-title">{t('Все кейсы')}</div>
        </>
      )}
      <div className="cases-grid">
        {regular.map((c) => (
          <CaseCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  )
}
