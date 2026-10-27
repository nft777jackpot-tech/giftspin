import { useEffect, useState } from 'react'
import { giftRarity, randomNum, type Gift } from '../data/gifts'
import { randomPlayer } from '../data/players'
import { t } from '../lib/i18n'
import { GAME_NAMES, type GameId } from '../lib/verify'
import { useStore } from '../state/store'
import { GiftImg } from './GiftImg'

interface Drop {
  id: number
  giftId: string
  num: number
  player: string
  game: GameId
}

const GAMES: GameId[] = ['case', 'case', 'battle', 'upgrade', 'contract', 'coinflip', 'jackpot', 'crash']
let seq = 0

// Дешёвые подарки выпадают чаще, как и в реальной ленте. В ленте только подарки с витрины
function randomDrop(gifts: Gift[]): Drop {
  const weights = gifts.map((g) => 1 / g.price)
  const total = weights.reduce((a, b) => a + b, 0)
  let u = Math.random() * total
  let gift = gifts[0]
  for (let i = 0; i < gifts.length; i++) {
    u -= weights[i]
    if (u <= 0) {
      gift = gifts[i]
      break
    }
  }
  return {
    id: ++seq,
    giftId: gift.id,
    num: randomNum(),
    player: randomPlayer().name,
    game: GAMES[Math.floor(Math.random() * GAMES.length)],
  }
}

export function LiveFeed() {
  const { catalog } = useStore()
  const [drops, setDrops] = useState<Drop[]>([])

  // Витрина сменилась, например пришла со склада: лента собирается заново из её подарков
  useEffect(() => {
    if (!catalog.length) {
      setDrops([])
      return
    }
    setDrops(Array.from({ length: 12 }, () => randomDrop(catalog)))
    const timer = setInterval(() => setDrops((d) => [randomDrop(catalog), ...d].slice(0, 20)), 2600)
    return () => clearInterval(timer)
  }, [catalog])

  if (!drops.length) return null

  return (
    <section className="live" aria-label={t('Последние выигрыши')}>
      <div className="live__label">
        <span className="live__dot" /> Live
      </div>
      <div className="live__track">
        {drops.map((d) => (
          <div key={d.id} className={`live__item rarity-${giftRarity(d.giftId)}`} title={`${d.player} · ${t(GAME_NAMES[d.game])}`}>
            <GiftImg giftId={d.giftId} num={d.num} size={44} />
          </div>
        ))}
      </div>
    </section>
  )
}
