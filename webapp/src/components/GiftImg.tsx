import { useState } from 'react'
import { getGift, giftImage } from '../data/gifts'

/** Стабильный номер для витрин, чтобы одна коллекция выглядела одинаково и кэшировалась. */
export function displayNum(giftId: string): number {
  let h = 0
  for (const ch of giftId) h = (h * 31 + ch.charCodeAt(0)) % 997
  return 1 + (h % 200)
}

interface Props {
  giftId: string
  num?: number
  /** Без size картинка растягивается на контейнер. */
  size?: number
  className?: string
}

export function GiftImg({ giftId, num, size, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const style = size ? { width: size, height: size } : undefined
  if (failed) {
    return (
      <div className={`gift-img gift-img--fallback ${className}`} style={style}>
        🎁
      </div>
    )
  }
  return (
    <img
      className={`gift-img ${className}`}
      style={style}
      src={giftImage(giftId, num || getGift(giftId).num || displayNum(giftId))}
      alt={getGift(giftId).name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
