import type { ReactNode } from 'react'
import { getGift, giftRarity } from '../data/gifts'
import { GiftImg } from './GiftImg'
import { Money } from './Money'

interface Props {
  giftId: string
  num?: number
  selected?: boolean
  dim?: boolean
  onClick?: () => void
  footer?: ReactNode
  showNum?: boolean
}

export function GiftCard({ giftId, num, selected, dim, onClick, footer, showNum }: Props) {
  const gift = getGift(giftId)
  const rarity = giftRarity(giftId)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`gift-card rarity-${rarity} ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`}
      onClick={onClick}
    >
      <div className="gift-card__img">
        <GiftImg giftId={giftId} num={num} />
        {selected && <span className="gift-card__check">✓</span>}
      </div>
      <div className="gift-card__name">
        {gift.name}
        {showNum && num ? <span className="gift-card__num"> #{num}</span> : null}
      </div>
      {footer ?? <Money ton={gift.price} size={12} className="gift-card__price" />}
    </Tag>
  )
}
