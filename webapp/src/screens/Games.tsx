import type { ReactNode } from 'react'
import {
  IconBolt,
  IconBomb,
  IconBox,
  IconCoin,
  IconCrown,
  IconDice,
  IconLayers,
  IconMegaphone,
  IconPlinko,
  IconRocket,
  IconShield,
  IconSwords,
  IconTasks,
  IconUpgrade,
  IconUsers,
  IconWheel,
} from '../components/icons'
import { GiftModelImg } from '../components/GiftModelImg'
import { LiveFeed } from '../components/LiveFeed'
import { OnlineDot } from '../components/OnlineDot'
import { RTP } from '../config'
import { t } from '../lib/i18n'
import { channelLink } from '../lib/links'
import { haptic, openTg } from '../lib/telegram'
import { useNav, type Page } from '../state/nav'

/** Модели подарков на плитках игр: коллекция и номер экземпляра с нужной моделью на Fragment. */
const TILE_MODELS = {
  cases: { slug: 'plushpepe', num: 1404 }, // Gucci Leap
  battles: { slug: 'heroichelmet', num: 47 }, // Cyberpunk
  upgrade: { slug: 'nailbracelet', num: 274 }, // Crypto Gem
  crash: { slug: 'stellarrocket', num: 179 }, // To The Moon
  mines: { slug: 'eternalcandle', num: 77 }, // Tortuga
  plinko: { slug: 'evileye', num: 12 }, // 8 Ball
  roulette: { slug: 'diamondring', num: 722 }, // Black Hole
  dice: { slug: 'signetring', num: 23 }, // Diamonds
  coinflip: { slug: 'artisanbrick', num: 228 }, // Cash Roll
  contracts: { slug: 'victorymedal', num: 98 }, // Dealmaker
  jackpot: { slug: 'finepen', num: 1168 }, // Big Iron
}

interface TileProps {
  /** Раздел для счётчика онлайна. */
  room: string
  title: string
  sub: string
  icon: ReactNode
  tone: string
  model: { slug: string; num: number }
  wide?: boolean
  badge?: string
  onClick(): void
}

function GameTile({ room, title, sub, icon, tone, model, wide, badge, onClick }: TileProps) {
  return (
    <button
      type="button"
      className={`game-tile game-tile--${tone} ${wide ? 'game-tile--wide' : ''}`}
      onClick={() => {
        haptic.tap()
        onClick()
      }}
    >
      <div className="game-tile__icon">{icon}</div>
      <OnlineDot room={room} className="game-tile__online" />
      <div className="game-tile__text">
        <div className="game-tile__title">
          {title}
          {badge && <span className="game-tile__badge">{badge}</span>}
        </div>
        <div className="game-tile__sub">{sub}</div>
      </div>
      {/* Подарок выглядывает из-за правого края плитки */}
      <GiftModelImg slug={model.slug} num={model.num} className={`game-tile__model game-tile__model--${model.slug}`} />
    </button>
  )
}

export function Games() {
  const { setTab, open } = useNav()
  const rtpPct = Math.round(RTP * 100)
  const go = (p: Page) => () => open(p)

  return (
    <div className="screen screen--wide">
      <LiveFeed />

      <div className="quick-row">
        <button type="button" className="quick" onClick={go({ name: 'tasks' })}>
          <IconTasks size={20} />
          <span>{t('Задания')}</span>
        </button>
        <button type="button" className="quick" onClick={go({ name: 'referrals' })}>
          <IconUsers size={20} />
          <span>{t('Друзья')}</span>
        </button>
        <button
          type="button"
          className="quick"
          onClick={() => {
            haptic.tap()
            openTg(channelLink())
          }}
        >
          <IconMegaphone size={20} />
          <span>{t('Инфо канал')}</span>
        </button>
      </div>

      <div className="section-title">{t('Игры')}</div>
      <div className="games-grid">
        <GameTile wide room="cases" title={t('Кейсы')} sub={t('Забери NFT-подарок')} tone="blue" icon={<IconBox size={22} />} model={TILE_MODELS.cases} onClick={() => setTab('cases')} />
        <GameTile room="battles" title={t('Кейс-батлы')} sub={t('Кто выбьет дороже')} tone="pink" badge="PvP" icon={<IconSwords size={22} />} model={TILE_MODELS.battles} onClick={go({ name: 'battles' })} />
        <GameTile room="upgrade" title={t('Апгрейд')} sub={t('Обменяй на дороже')} tone="violet" icon={<IconUpgrade size={22} />} model={TILE_MODELS.upgrade} onClick={() => setTab('upgrade')} />
        <GameTile room="crash" title={t('Краш')} sub={t('Забери до взрыва')} tone="orange" icon={<IconRocket size={22} />} model={TILE_MODELS.crash} onClick={go({ name: 'crash' })} />
        <GameTile room="mines" title={t('Мины')} sub={t('Открывай клетки')} tone="teal" icon={<IconBomb size={22} />} model={TILE_MODELS.mines} onClick={go({ name: 'mines' })} />
        <GameTile room="plinko" title={t('Плинко')} sub={t('Шарик и множители')} tone="gold" icon={<IconPlinko size={22} />} model={TILE_MODELS.plinko} onClick={go({ name: 'plinko' })} />
        <GameTile room="roulette" title={t('Рулетка')} sub={t('Красное, чёрное, зелёное')} tone="red" icon={<IconWheel size={22} />} model={TILE_MODELS.roulette} onClick={go({ name: 'roulette' })} />
        <GameTile room="dice" title={t('Дайс')} sub={t('Свой шанс и множитель')} tone="cyan" icon={<IconDice size={22} />} model={TILE_MODELS.dice} onClick={go({ name: 'dice' })} />
        <GameTile room="coinflip" title={t('Коинфлип')} sub={t('Один на один')} tone="blue" badge="PvP" icon={<IconCoin size={22} />} model={TILE_MODELS.coinflip} onClick={go({ name: 'coinflip' })} />
        <GameTile room="contracts" title={t('Контракты')} sub={t('Несколько в один')} tone="violet" icon={<IconLayers size={22} />} model={TILE_MODELS.contracts} onClick={go({ name: 'contracts' })} />
        <GameTile room="jackpot" title={t('PvP-джекпот')} sub={t('Игроки против игроков')} tone="green" badge="PvP" icon={<IconCrown size={22} />} model={TILE_MODELS.jackpot} onClick={go({ name: 'jackpot' })} />
      </div>

      <div className="perks">
        <button type="button" className="perk" onClick={go({ name: 'fair' })}>
          <IconShield size={20} />
          <div>
            <b>{t('Честная игра')}</b>
            <span>{t('Хеш исхода до ставки')}</span>
          </div>
        </button>
        <button type="button" className="perk" onClick={go({ name: 'fair' })}>
          <span className="perk__rtp">{rtpPct}%</span>
          <div>
            <b>RTP</b>
            <span>{t('Фактический — открыт')}</span>
          </div>
        </button>
        <div className="perk">
          <IconBolt size={20} />
          <div>
            <b>{t('Быстрый вывод')}</b>
            <span>{t('TON и подарки')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
