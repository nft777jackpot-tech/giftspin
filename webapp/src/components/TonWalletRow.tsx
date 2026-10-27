import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'
import { IconWallet } from './icons'
import { toast } from './Toaster'

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a)

/** Подключение настоящего кошелька через TON Connect. Сеть кошелька должна совпадать с сетью сервера. */
export function TonWalletRow() {
  const [tonConnectUI] = useTonConnectUI()
  const address = useTonAddress()
  const { server } = useStore()
  const testnet = server?.network === 'testnet'

  const connect = async () => {
    haptic.tap()
    try {
      // Кошелёк из другой сети не подключится: так тестовые переводы не уйдут в основную сеть
      tonConnectUI.setConnectionNetwork(testnet ? '-3' : '-239')
      await tonConnectUI.openModal()
    } catch (e) {
      toast(String((e as Error).message ?? e), 'error')
    }
  }

  return (
    <div className="wallet-row">
      <span className="wallet-row__icon">
        <IconWallet size={20} />
      </span>
      <div className="wallet-row__text">
        <b>{address ? t('Кошелёк подключён') : t('Кошелёк не подключён')}</b>
        <span className={`muted small ${address ? 'mono' : ''}`}>
          {address ? short(address) : testnet ? t('Tonkeeper или MyTonWallet в тестовой сети') : 'Tonkeeper, MyTonWallet, Telegram Wallet'}
        </span>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => {
          if (address) {
            haptic.tap()
            tonConnectUI.disconnect()
          } else connect()
        }}
      >
        {address ? t('Отключить') : t('Подключить')}
      </button>
    </div>
  )
}
