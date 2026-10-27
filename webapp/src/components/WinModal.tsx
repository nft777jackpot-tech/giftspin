import { useState, type ReactNode } from 'react'
import { BIG_WIN_TON, BRAND } from '../config'
import { getGift, giftImage, giftRarity } from '../data/gifts'
import { fmtAmount } from '../lib/format'
import { t } from '../lib/i18n'
import { refLink } from '../lib/links'
import { canShareStory, getMe, haptic, shareStory, shareToChat } from '../lib/telegram'
import { useStore } from '../state/store'
import { displayNum, GiftImg } from './GiftImg'
import { IconMegaphone, IconSend, IconShare } from './icons'
import { Money } from './Money'
import { toast } from './Toaster'

interface Props {
  open: boolean
  title: string
  giftId?: string
  num?: number
  /** Сумма в TON для денежных выигрышей. */
  amount?: number
  lost?: boolean
  /** Несколько выигранных подарков сразу, например при открытии нескольких кейсов. */
  items?: { giftId: string; num: number }[]
  /** Пояснение под суммой, например что монеты уже на балансе. */
  note?: ReactNode
  children: ReactNode
}

export function WinModal({ open, title, giftId, num, amount, lost, items, note, children }: Props) {
  const { noteShare } = useStore()
  const [sharing, setSharing] = useState(false)
  if (!open) return null
  const gift = giftId ? getGift(giftId) : null
  // В сетке подарков свечение окна и картинка для «Поделиться» берутся от самого дорогого
  const best = items?.length ? items.reduce((a, b) => (getGift(b.giftId).price > getGift(a.giftId).price ? b : a)) : null
  const shareGift = gift ?? (best ? getGift(best.giftId) : null)
  const shareNum = gift ? num : best?.num
  const value = gift?.price ?? amount ?? 0
  const big = !lost && value >= BIG_WIN_TON

  const share = (where: 'story' | 'chat') => {
    const link = refLink(getMe().id)
    const what = shareGift ? shareGift.name : `${fmtAmount(amount ?? 0)} TON`
    const text = t('Выбил {what} в {brand}! Заходи по моей ссылке', { what, brand: BRAND })
    if (where === 'story') {
      const media = giftImage(shareGift?.id ?? 'plushpepe', shareNum ?? displayNum(shareGift?.id ?? 'plushpepe'))
      shareStory(media, text, link, t('Играть'))
    } else {
      shareToChat(shareGift ? `win ${shareGift.id} ${shareNum ?? ''}`.trim() : `win ton ${(amount ?? 0).toFixed(2)}`, text, link)
    }
    noteShare()
    haptic.success()
    toast(t('Спасибо, что делитесь!'), 'success')
    setSharing(false)
  }

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-backdrop" />
      <div className={`modal ${lost ? 'modal--lost' : ''} ${shareGift ? `rarity-${giftRarity(shareGift.id)}` : ''}`}>
        {!lost && <div className="modal__rays" />}
        <div className="modal__title">{title}</div>
        {gift && (
          <div className="modal__gift">
            <GiftImg giftId={gift.id} num={num} />
          </div>
        )}
        {gift && <div className="modal__name">{gift.name}{num ? <span className="muted"> #{num}</span> : null}</div>}
        {gift && <Money ton={gift.price} size={18} className="modal__value" />}
        {items && items.length > 0 && (
          <div className="modal__grid">
            {items.map((it, i) => (
              <div key={i} className={`modal__cell rarity-${giftRarity(it.giftId)}`} title={getGift(it.giftId).name}>
                <GiftImg giftId={it.giftId} num={it.num} />
              </div>
            ))}
          </div>
        )}
        {amount !== undefined && <Money ton={amount} size={24} className="modal__amount" sign={!lost} />}
        {note && <div className="modal__note">{note}</div>}
        {big && (
          <div className="modal__big">
            <IconMegaphone size={14} /> {t('Крупный выигрыш попадёт в канал проекта')}
          </div>
        )}
        {!lost && (
          <div className="modal__share">
            {sharing ? (
              <div className="row-2">
                {canShareStory() && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => share('story')}>
                    <IconShare size={15} /> {t('В сторис')}
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => share('chat')}>
                  <IconSend size={15} /> {t('В чат')}
                </button>
              </div>
            ) : (
              <button type="button" className="link-btn" onClick={() => setSharing(true)}>
                <IconShare size={14} /> {t('Поделиться выигрышем')}
              </button>
            )}
          </div>
        )}
        <div className="modal__actions" onClick={() => setSharing(false)}>
          {children}
        </div>
      </div>
    </div>
  )
}
