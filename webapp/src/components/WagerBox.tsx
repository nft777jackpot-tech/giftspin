import { t } from '../lib/i18n'
import { useStore } from '../state/store'
import { Money } from './Money'

/** Сколько ещё нужно поставить, чтобы открылся вывод. Когда всё отыграно, не показывается. */
export function WagerBox() {
  const { wagerLeft } = useStore()
  if (wagerLeft <= 0) return null
  return (
    <div className="wager-box" role="status">
      <b>
        {t('Осталось отыграть')} <Money ton={Math.ceil(wagerLeft * 100) / 100} size={13} />
      </b>
      <span>{t('Поставьте эту сумму в любых играх, и вывод откроется. Отыгрывать нужно пополнения и награды за задания.')}</span>
    </div>
  )
}
