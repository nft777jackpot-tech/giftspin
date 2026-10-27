import { useTonAddress } from '@tonconnect/ui-react'
import { useCallback, useEffect, useState } from 'react'
import { GiftCard } from '../components/GiftCard'
import { IconGift, TonIcon } from '../components/icons'
import { Money } from '../components/Money'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { TonWalletRow } from '../components/TonWalletRow'
import { DEPOSIT_ACCOUNT } from '../config'
import { api, ApiError, explorerTx, type Withdrawal } from '../lib/api'
import { fmtAmount, fmtTime } from '../lib/format'
import { t, tk } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

type Tab = 'ton' | 'gifts'

// Комиссия и минимум вывода в демо, без сервера
const NETWORK_FEE = 0.05
const MIN_WITHDRAW = 1

const GIFT_STATUS: Record<'withdrawing' | 'transferring' | 'sent', string> = {
  withdrawing: tk('На проверке'),
  transferring: tk('Передаётся'),
  sent: tk('Передан в Telegram'),
}

const STATUS: Record<Withdrawal['status'], string> = {
  queued: tk('В очереди'),
  review: tk('На проверке'),
  sending: tk('Отправляется'),
  sent: tk('Отправлен'),
  failed: tk('Не отправлен, деньги возвращены'),
  rejected: tk('Отклонён, деньги возвращены'),
}

export function WithdrawSheet() {
  const { sheet, openSheet, balanceTon, withdraw, inventory, withdrawGifts, giftRequests, warehouse, server, refreshServer } = useStore()
  const walletAddress = useTonAddress()
  const [tab, setTab] = useState<Tab>('ton')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [list, setList] = useState<Withdrawal[]>([])
  const [busy, setBusy] = useState(false)
  const close = () => openSheet(null)

  // При запущенном сервере TON выводятся по-настоящему: заявкой, которую сервер отправит с кошелька проекта
  const live = !!server
  const limits = server?.limits
  const value = parseFloat(amount.replace(',', '.')) || 0
  const have = balanceTon
  const fee = limits ? Number(limits.withdrawFee) : NETWORK_FEE
  const min = limits ? Number(limits.minWithdraw) : MIN_WITHDRAW
  const addressOk = /^[A-Za-z0-9_-]{48}$/.test(address.trim())
  const canSend = addressOk && value >= min && value <= have + 1e-9 && value > fee && !busy

  const loadList = useCallback(() => {
    if (server) api<Withdrawal[]>('/withdrawals').then(setList).catch(() => {})
  }, [server])

  useEffect(() => {
    if (sheet !== 'withdraw') return
    loadList()
    const timer = setInterval(loadList, 5000)
    return () => clearInterval(timer)
  }, [sheet, loadList])

  // Адрес подставляется из подключённого кошелька, если поле пустое
  useEffect(() => {
    if (live && walletAddress && !address) setAddress(walletAddress)
  }, [live, walletAddress, address])

  const submit = async () => {
    if (!live) {
      if (!withdraw(value, `${t('Вывод')} TON`)) return
      haptic.success()
      toast(t('Заявка на вывод создана'), 'success')
      setAmount('')
      close()
      return
    }
    setBusy(true)
    try {
      const res = await api<{ status: Withdrawal['status'] }>('/withdrawals', { method: 'POST', body: { address: address.trim(), amount: value.toFixed(9) } })
      haptic.success()
      toast(res.status === 'review' ? t('Крупный вывод: отправим после ручной проверки') : t('Заявка принята, отправим в течение минуты'), 'success')
      setAmount('')
      await refreshServer()
      loadList()
    } catch (e) {
      haptic.error()
      toast(e instanceof ApiError ? e.message : t('Сервер недоступен'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={sheet === 'withdraw'} title={t('Вывод')} onClose={close}>
      <div className="seg">
        <button type="button" className={tab === 'ton' ? 'is-active' : ''} onClick={() => setTab('ton')}>
          <TonIcon size={16} /> TON
        </button>
        <button type="button" className={tab === 'gifts' ? 'is-active' : ''} onClick={() => setTab('gifts')}>
          <IconGift size={16} /> {t('Подарки')}
        </button>
      </div>

      {tab === 'ton' && (
        <div className="stack">
          {live && <TonWalletRow />}

          <label className="field">
            <span>{t('Адрес кошелька')}</span>
            <input className="input mono" placeholder={server?.network === 'testnet' ? '0Q…' : 'UQ…'} value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
          </label>

          <label className="field">
            <span>
              {t('Сумма · доступно')} <Money ton={have} size={12} />
            </span>
            <div className="amount-field">
              <TonIcon size={22} />
              <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('Сумма вывода')} />
              <button type="button" className="chip" onClick={() => setAmount(String(Math.floor(have * 100) / 100))}>
                {t('Макс')}
              </button>
            </div>
          </label>
          <div className="kv">
            <span>{t('Комиссия')}</span>
            <span>{fmtAmount(fee)} TON</span>
          </div>
          <div className="kv">
            <span>{t('Вы получите')}</span>
            <b>{fmtAmount(Math.max(0, value - fee))} TON</b>
          </div>
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!canSend} onClick={submit}>
            {busy ? t('Отправляем заявку…') : t('Вывести')}
          </button>
          <p className="note">
            {limits
              ? t('Минимум {min} TON, максимум {max} TON за раз. Выводы больше {review} TON проверяются вручную.', {
                  min: fmtAmount(min),
                  max: fmtAmount(Number(limits.maxWithdraw)),
                  review: fmtAmount(Number(limits.reviewOver)),
                })
              : t('Минимум {min} TON. Крупные выводы проверяются вручную, обычно до часа.', { min: MIN_WITHDRAW })}
          </p>

          {live && list.length > 0 && (
            <div className="withdraw-list">
              <div className="section-title section-title--sm">{t('Мои выводы')}</div>
              {list.slice(0, 6).map((w) => (
                <div key={w.id} className={`withdraw-row withdraw-row--${w.status}`}>
                  <div>
                    <b>{fmtAmount(Number(w.amount) - Number(w.fee))} TON</b>
                    <span className="muted small">
                      {fmtTime(w.at)} · {t(STATUS[w.status])}
                    </span>
                    {w.error && w.status !== 'sent' && <span className="muted small">{w.error}</span>}
                  </div>
                  {w.hash && server && (
                    <a className="link-btn small" href={explorerTx(w.hash, server.network)} target="_blank" rel="noreferrer">
                      {t('В блокчейне')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'gifts' && (
        <div className="stack">
          {inventory.length ? (
            <div className="gift-grid">
              {inventory.map((i) => (
                <GiftCard
                  key={i.uid}
                  giftId={i.giftId}
                  num={i.num}
                  showNum
                  selected={picked.includes(i.uid)}
                  onClick={() => {
                    haptic.select()
                    setPicked((p) => (p.includes(i.uid) ? p.filter((x) => x !== i.uid) : [...p, i.uid]))
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="empty">{t('В инвентаре нет подарков')}</div>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={!picked.length}
            onClick={() => {
              withdrawGifts(picked)
              setPicked([])
              haptic.success()
              toast(server ? t('Заявка принята: подарок придёт после проверки') : t('Подарки отправлены в Telegram'), 'success')
              if (!server) close()
            }}
          >
            {t('Вывести {n} в Telegram', { n: picked.length || '' })}
          </button>
          {server && giftRequests.length > 0 && (
            <div className="withdraw-list">
              <div className="section-title section-title--sm">{t('Мои выводы подарков')}</div>
              {giftRequests.slice(0, 8).map((g) => (
                <div key={g.id} className={`withdraw-row withdraw-row--${g.status === 'withdrawing' ? 'review' : g.status === 'transferring' ? 'sending' : 'sent'}`}>
                  <div>
                    <b>
                      {g.name} #{g.num}
                    </b>
                    <span className="muted small">{t(GIFT_STATUS[g.status as keyof typeof GIFT_STATUS])}</span>
                    {g.error && g.status !== 'sent' && <span className="muted small">{g.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="note">
            {server
              ? t('Подарок передаёт бот с аккаунта-склада {account} после проверки, обычно в течение часа. Перед выводом напишите боту: Telegram передаёт подарки только тем, кто был активен последние сутки.', {
                  account: warehouse?.account ? `@${warehouse.account}` : DEPOSIT_ACCOUNT,
                })
              : t('Подарки придут от {account} в течение пары минут. Комиссию Telegram за перевод платим мы.', { account: DEPOSIT_ACCOUNT })}
          </p>
        </div>
      )}
    </Sheet>
  )
}
