import { findGift, giftRarity, isCoin } from '../data/gifts'
import { fmtAmount } from '../lib/format'
import { t } from '../lib/i18n'
import { useLive, type FeedItem } from '../lib/live'
import { GAME_NAMES, type GameId } from '../lib/verify'
import { useStore } from '../state/store'
import { GiftImg } from './GiftImg'
import { TonIcon } from './icons'

const gameName = (game: string) => (game === 'gift' ? t('Подарок') : game in GAME_NAMES ? t(GAME_NAMES[game as GameId]) : game)

function Item({ d }: { d: FeedItem }) {
  const title = `${d.name} · ${gameName(d.game)} · ${fmtAmount(Number(d.amount))} TON`
  if (d.gift && findGift(d.gift.slug)) {
    return (
      <div className={`live__item rarity-${giftRarity(d.gift.slug)}`} title={title}>
        <GiftImg giftId={d.gift.slug} num={d.gift.num} size={44} />
      </div>
    )
  }
  if (d.prize && isCoin(d.prize)) {
    return (
      <div className={`live__item rarity-${giftRarity(d.prize)}`} title={title}>
        <GiftImg giftId={d.prize} size={44} />
      </div>
    )
  }
  return (
    <div className="live__item live__item--ton" title={title}>
      <TonIcon size={14} />
      <b>{fmtAmount(Number(d.amount))}</b>
      <span>{gameName(d.game)}</span>
    </div>
  )
}

/**
 * Лента последних выигрышей. С сервером — выигрыши всех игроков вживую. Без сервера других игроков нет,
 * поэтому в ленте только свои выигрыши за эту сессию — без выдуманных.
 */
export function LiveFeed() {
  const { connected, feed } = useLive()
  const { drops } = useStore()
  const items = connected ? feed : drops
  if (!items.length) return null
  return (
    <section className="live" aria-label={t('Последние выигрыши')}>
      <div className="live__label">
        <span className="live__dot" /> Live
      </div>
      <div className="live__track">
        {items.map((d) => (
          <Item key={d.id} d={d} />
        ))}
      </div>
    </section>
  )
}
