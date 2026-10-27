import { BRAND, DEMO } from '../config'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'
import { IconGift, IconPlus } from './icons'
import { Money } from './Money'

export function Header() {
  const { balanceTon, openSheet, server } = useStore()
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__logo">
          <IconGift size={18} />
        </span>
        <span className="brand__name">{BRAND}</span>
        {server ? (
          server.network === 'testnet' && <span className="badge badge--testnet">testnet</span>
        ) : (
          DEMO && <span className="badge badge--demo">{t('демо')}</span>
        )}
      </div>
      <div className="balance">
        <div className="balance__pill">
          <Money ton={balanceTon} size={18} />
          <span className="balance__cur">TON</span>
        </div>
        <button
          type="button"
          className="balance__add"
          onClick={() => {
            haptic.tap()
            openSheet('deposit')
          }}
          aria-label={t('Пополнить')}
        >
          <IconPlus size={18} />
        </button>
      </div>
    </header>
  )
}
