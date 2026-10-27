import { useEffect, useState, type CSSProperties } from 'react'
import { cachedModel, collectionThumb, loadModel } from '../lib/giftModels'

interface Props {
  slug: string
  /** Номер экземпляра: от него зависит модель. */
  num: number
  className?: string
  style?: CSSProperties
}

/** Модель NFT-подарка без фона и узора. Пока она рисуется, места не занимает, потом плавно проявляется. */
export function GiftModelImg({ slug, num, className = '', style }: Props) {
  const [src, setSrc] = useState<string | null>(() => cachedModel(slug, num)?.src ?? null)

  useEffect(() => {
    if (src) return
    let alive = true
    loadModel(slug, num).then((m) => {
      if (alive) setSrc(m?.src ?? collectionThumb(slug))
    })
    return () => {
      alive = false
    }
    // Модель грузится один раз для пары slug и номера
  }, [slug, num])

  return <img className={`model-img ${src ? 'is-ready' : ''} ${className}`} src={src ?? undefined} style={style} alt="" draggable={false} />
}
