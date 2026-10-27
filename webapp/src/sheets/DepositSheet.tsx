import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { useEffect, useState } from 'react'
import { GiftImg } from '../components/GiftImg'
import { IconCopy, IconGift, IconWallet, TonIcon } from '../components/icons'
import { Money } from '../components/Money'
import { QrCode } from '../components/QrCode'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { TonWalletRow } from '../components/TonWalletRow'
import { DEPOSIT_ACCOUNT } from '../config'
import { GIFTS, getGift } from '../data/gifts'
import { api, toNanoString, transferLink, type DepositInfo, type ServerMe } from '../lib/api'
import { fmtAmount } from '../lib/format'
import { t } from '../lib/i18n'
import { copyText, haptic } from '../lib/telegram'
import { useStore } from '../state/store'

type Tab = 'ton' | 'gift'

const PRESETS = [1, 5, 10, 25, 50]
/** Минимум пополнения в демо, без сервера. */
const MIN_DEPOSIT = 0.5
const RATE_EXAMPLES = ['plushpepe', 'durovscap', 'lootbag', 'kissedfrog', 'eternalrose', 'lolpop']
/** Сколько ждать подтверждения перевода, прежде чем перестать опрашивать сервер. */
const CONFIRM_POLLS = 24
const POLL_MS = 5000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function DepositSheet() {
  const { sheet, openSheet, deposit, server, refreshServer, warehouse, catalog } = useStore()
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const [tab, setTab] = useState<Tab>('ton')
  const [amount, setAmount] = useState('5')
  const [demoWallet, setDemoWallet] = useState<string | null>(null)
  const [info, setInfo] = useState<DepositInfo | null>(null)
  const [sending, setSending] = useState(false)
  const close = () => openSheet(null)
  const value = parseFloat(amount.replace(',', '.')) || 0
  // При запущенном сервере TON настоящие: перевод на кошелёк проекта через TON Connect
  const live = !!server
  const min = server ? Number(server.limits.minDeposit) : MIN_DEPOSIT
  const connected = live ? !!walletAddress : !!demoWallet
  // Подарки принимает аккаунт-склад. Без сервера — демо-аккаунт и демо-оценки
  const giftAccount = warehouse?.account ? `@${warehouse.account}` : DEPOSIT_ACCOUNT
  const rateExamples = server ? catalog.slice(0, 6).map((g) => g.id) : RATE_EXAMPLES
  const giftsReady = !!giftAccount && (!server || (!!warehouse && warehouse.mode !== 'off' && warehouse.connected))

  useEffect(() => {
    if (sheet === 'deposit' && server) api<DepositInfo>('/deposit').then(setInfo).catch(() => setInfo(null))
  }, [sheet, server?.id])

  const copy = (text: string) => {
    copyText(text)
    haptic.success()
    toast(t('Скопировано'), 'success')
  }

  /** Ждём, пока сервер увидит перевод в сети и зачислит его. */
  const waitForCredit = async (before: number) => {
    for (let i = 0; i < CONFIRM_POLLS; i++) {
      await sleep(POLL_MS)
      const me = await api<ServerMe>('/me').catch(() => null)
      if (me && Number(me.balance) > before + 1e-9) {
        await refreshServer()
        haptic.success()
        toast(t('Зачислено {amount} {cur}', { amount: fmtAmount(Number(me.balance) - before), cur: 'TON' }), 'success')
        return
      }
    }
    toast(t('Перевод ещё не подтверждён. Баланс обновится сам, как только сеть его примет'))
  }

  const payLive = async () => {
    if (!server) return
    const d = info ?? (await api<DepositInfo>('/deposit'))
    const before = Number(server.balance)
    setSending(true)
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        network: d.chain,
        messages: [{ address: d.address, amount: toNanoString(value), payload: d.payload }],
      })
    } catch {
      setSending(false)
      toast(t('Перевод отменён'), 'error')
      return
    }
    setSending(false)
    toast(t('Перевод отправлен, ждём подтверждения сети'), 'success')
    close()
    waitForCredit(before)
  }

  const pay = () => {
    if (live) {
      payLive()
      return
    }
    // Демо без сервера: зачисляем сразу
    deposit(value, `${t('Пополнение')} TON`)
    haptic.success()
    toast(t('Зачислено {amount} {cur}', { amount: fmtAmount(value), cur: 'TON' }), 'success')
    close()
  }

  return (
    <Sheet open={sheet === 'deposit'} title={t('Пополнение')} onClose={close}>
      <div className="seg">
        <button type="button" className={tab === 'ton' ? 'is-active' : ''} onClick={() => setTab('ton')}>
          <TonIcon size={16} /> TON
        </button>
        <button type="button" className={tab === 'gift' ? 'is-active' : ''} onClick={() => setTab('gift')}>
          <IconGift size={16} /> {t('Подарок')}
        </button>
      </div>

      {tab === 'ton' && (
        <div className="stack">
          {live ? (
            <TonWalletRow />
          ) : (
            <div className="wallet-row">
              <span className="wallet-row__icon">
                <IconWallet size={20} />
              </span>
              <div className="wallet-row__text">
                <b>{demoWallet ? t('Кошелёк подключён') : t('Кошелёк не подключён')}</b>
                <span className="muted small">{demoWallet ?? 'Tonkeeper, MyTonWallet, Telegram Wallet'}</span>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setDemoWallet(demoWallet ? null : 'UQBx…k3f9')
                  haptic.tap()
                }}
              >
                {demoWallet ? t('Отключить') : t('Подключить')}
              </button>
            </div>
          )}

          <label className="amount-field">
            <TonIcon size={22} />
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('Сумма')} />
            <span className="muted">TON</span>
          </label>
          <div className="chips-row">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip ${value === p ? 'is-active' : ''}`} onClick={() => setAmount(String(p))}>
                {p}
              </button>
            ))}
          </div>

          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={value < min || !connected || sending} onClick={pay}>
            {sending
              ? t('Подтвердите перевод в кошельке…')
              : connected
                ? t('Пополнить на {amount} {cur}', { amount: fmtAmount(value), cur: 'TON' })
                : t('Сначала подключите кошелёк')}
          </button>

          {live && info && (
            <div className="manual-transfer">
              <div className="section-title section-title--sm">{t('Или переведите по QR-коду')}</div>
              <div className="manual-transfer__qr">
                <QrCode value={transferLink(info.address, info.memo, value >= min ? value : 0)} label={t('QR-код перевода')} />
                <p className="note">
                  {t('Отсканируйте камерой в Tonkeeper: адрес, сумма {amount} TON и комментарий подставятся сами.', { amount: fmtAmount(value) })}
                </p>
                <a className="btn btn--ghost btn--sm" href={transferLink(info.address, info.memo, value >= min ? value : 0)}>
                  {t('Открыть в кошельке')}
                </a>
              </div>
              <button type="button" className="copy-row" onClick={() => copy(info.address)}>
                <span className="muted small">{t('Адрес')}</span>
                <code className="mono">{info.address}</code>
                <IconCopy size={14} />
              </button>
              <button type="button" className="copy-row" onClick={() => copy(info.memo)}>
                <span className="muted small">{t('Комментарий')}</span>
                <code className="mono">{info.memo}</code>
                <IconCopy size={14} />
              </button>
              <p className="note">{t('Без этого комментария перевод не найдёт ваш аккаунт. Каждому игроку — свой код.')}</p>
            </div>
          )}

          <p className="note">
            {live
              ? server?.network === 'testnet'
                ? t('Тестовая сеть TON: монеты ненастоящие, их бесплатно выдаёт бот @testgiver_ton_bot. Минимум {min} TON.', { min: fmtAmount(min) })
                : t('Минимум {min} TON. Деньги зачисляются после подтверждения в сети, обычно за несколько секунд.', { min: fmtAmount(min) })
              : t('Минимум {min} TON. Деньги зачисляются после подтверждения в сети, обычно за несколько секунд.', { min: MIN_DEPOSIT })}
          </p>
        </div>
      )}

      {tab === 'gift' && !giftsReady && (
        <div className="stack">
          <p className="note">{t('Пополнение подарком скоро появится. Пока пополняйте баланс в TON.')}</p>
        </div>
      )}

      {tab === 'gift' && giftsReady && (
        <div className="stack">
          <ol className="steps">
            <li>
              <div>
                {t('Откройте профиль')} <b>{giftAccount}</b>
              </div>
              <button type="button" className="icon-btn" onClick={() => copy(giftAccount)} aria-label={t('Скопировать')}>
                <IconCopy size={16} />
              </button>
            </li>
            <li>
              <div>{t('Отправьте ему NFT-подарок через «Отправить подарок»')}</div>
            </li>
            <li>
              <div>{t('Бот оценит подарок по минимальной цене коллекции и зачислит TON на баланс')}</div>
            </li>
          </ol>
          <div className="section-title section-title--sm">{t('Текущая оценка')}</div>
          <div className="rates">
            {rateExamples.map((id) => (
              <div key={id} className="rate">
                <GiftImg giftId={id} size={32} />
                <span className="rate__name">{getGift(id).name}</span>
                <Money ton={getGift(id).price} size={13} />
              </div>
            ))}
          </div>
          {!server && (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                const g = GIFTS[10 + Math.floor(Math.random() * 30)]
                deposit(g.price, `${t('Депозит подарком')} ${g.name}`)
                haptic.success()
                toast(`${g.name}: +${fmtAmount(g.price)} TON`, 'success')
                close()
              }}
            >
              {t('Демо: отправить подарок')}
            </button>
          )}
          <p className="note">{t('Принимаются только улучшенные NFT-подарки. Подарок, купленный на маркете Telegram, зачислится, когда его можно будет передать дальше: до 21 дня.')}</p>
        </div>
      )}
    </Sheet>
  )
}
