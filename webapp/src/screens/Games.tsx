import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { caseName, CaseCard } from '../components/CaseCard'
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
  IconTrophy,
  IconUpgrade,
  IconUsers,
  IconWheel,
} from '../components/icons'
import { GiftModelImg } from '../components/GiftModelImg'
import { LiveFeed } from '../components/LiveFeed'
import { RTP } from '../config'
import { fmtCountdown } from '../lib/format'
import { t } from '../lib/i18n'
import { channelLink } from '../lib/links'
import { haptic, openTg } from '../lib/telegram'
import { useNav, type Page } from '../state/nav'
import { useStore } from '../state/store'

/** Модели подарков на плитках игр: коллекция и номер экземпляра с нужной моделью на Fragment. */
const TILE_MODELS = {
  battles: { slug: 'heroichelmet', num: 47 }, // Cyberpunk
  upgrade: { slug: 'nailbracelet', num: 274 }, // Crypto Gem
  crash: { slug: 'stellarrocket', num: 179 }, // To the Moon
  mines: { slug: 'eternalcandle', num: 77 }, // Tortuga
  plinko: { slug: 'evileye', num: 12 }, // 8 Ball
  roulette: { slug: 'diamondring', num: 722 }, // Black Hole
  dice: { slug: 'signetring', num: 23 }, // Diamonds
  coinflip: { slug: 'artisanbrick', num: 228 }, // Cash Roll
  contracts: { slug: 'victorymedal', num: 98 }, // Dealmaker
  jackpot: { slug: 'minioscar', num: 383 }, // Legionary
}

// Подарок на широкой плитке «Кейсы»
const CASE_TILE_MODEL = { slug: 'plushpepe', num: 368 }

interface TileProps {
  title: string
  sub: string
  icon: ReactNode
  tone: string
  art?: ReactNode
  model?: { slug: string; num: number }
  wide?: boolean
  badge?: string
  onClick(): void
}

function GameTile({ title, sub, icon, tone, art, model, wide, badge, onClick }: TileProps) {
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
      {badge && <span className="game-tile__badge">{badge}</span>}
      <div className="game-tile__text">
        <div className="game-tile__title">{title}</div>
        <div className="game-tile__sub">{sub}</div>
      </div>
      {art && <div className="game-tile__art">{art}</div>}
      {model && <GiftModelImg slug={model.slug} num={model.num} className={`game-tile__model game-tile__model--${model.slug}`} />}
    </button>
  )
}

export function Games() {
  const { setTab, open } = useNav()
  const { cases } = useStore()
  const rtpPct = Math.round(RTP * 100)
  const [now, setNow] = useState(Date.now())
  const event = cases.find((c) => c.event && c.event.endsAt > now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const go = (p: Page) => () => open(p)

  return (
    <div className="screen">
      <LiveFeed />

      {event ? (
        <button
          type="button"
          className="event-banner"
          style={{ '--accent': event.accent } as CSSProperties}
          onClick={() => {
            haptic.tap()
            open({ name: 'case', id: event.id })
          }}
        >
          <div className="event-banner__text">
            <div className="hero__kicker">{t('Праздничный кейс')}</div>
            <div className="event-banner__title">{caseName(event)}</div>
            <div className="event-banner__timer">{t('Осталось {time}', { time: fmtCountdown(event.event!.endsAt - now) })}</div>
          </div>
          <div className="event-banner__art" aria-hidden>
            <GiftModelImg slug="skullflower" num={239} className="event-banner__gift event-banner__gift--a" />
            <GiftModelImg slug="witchhat" num={195} className="event-banner__gift event-banner__gift--b" />
            <GiftModelImg slug="magicpotion" num={724} className="event-banner__gift event-banner__gift--c" />
          </div>
        </button>
      ) : (
        <section className="hero">
          <div className="hero__text">
            <div className="hero__kicker">{t('NFT-подарки Telegram')}</div>
            <h1 className="hero__title">{t('Выбивай редкие подарки')}</h1>
            <p className="hero__sub">{t('Кейсы, батлы, краш и PvP. Каждую игру можно проверить.')}</p>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setTab('cases')}>
              {t('Открыть кейс')}
            </button>
          </div>
          <div className="hero__art" aria-hidden>
            <GiftModelImg slug="plushpepe" num={368} className="hero__gift hero__gift--1" />
            <GiftModelImg slug="durovscap" num={42} className="hero__gift hero__gift--2" />
            <GiftModelImg slug="kissedfrog" num={381} className="hero__gift hero__gift--3" />
          </div>
        </section>
      )}

      <div className="quick-row">
        <button type="button" className="quick" onClick={go({ name: 'tasks' })}>
          <IconTasks size={20} />
          <span>{t('Задания')}</span>
        </button>
        <button type="button" className="quick" onClick={go({ name: 'tournament' })}>
          <IconTrophy size={20} />
          <span>{t('Турнир')}</span>
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
        <GameTile
          wide
          title={t('Кейсы')}
          sub={t('Забери NFT-подарок')}
          tone="blue"
          icon={<IconBox size={22} />}
          onClick={() => setTab('cases')}
          art={<GiftModelImg slug={CASE_TILE_MODEL.slug} num={CASE_TILE_MODEL.num} className="game-tile__cluster game-tile__cluster--solo" />}
        />
        <GameTile title={t('Кейс-батлы')} sub={t('Кто выбьет дороже')} tone="pink" badge="PvP" icon={<IconSwords size={22} />} model={TILE_MODELS.battles} onClick={go({ name: 'battles' })} />
        <GameTile title={t('Апгрейд')} sub={t('Обменяй на дороже')} tone="violet" icon={<IconUpgrade size={22} />} model={TILE_MODELS.upgrade} onClick={() => setTab('upgrade')} />
        <GameTile title={t('Краш')} sub={t('Забери до взрыва')} tone="orange" icon={<IconRocket size={22} />} model={TILE_MODELS.crash} onClick={go({ name: 'crash' })} />
        <GameTile title={t('Мины')} sub={t('Открывай клетки')} tone="teal" icon={<IconBomb size={22} />} model={TILE_MODELS.mines} onClick={go({ name: 'mines' })} />
        <GameTile title={t('Плинко')} sub={t('Шарик и множители')} tone="gold" icon={<IconPlinko size={22} />} model={TILE_MODELS.plinko} onClick={go({ name: 'plinko' })} />
        <GameTile title={t('Рулетка')} sub={t('Красное, чёрное, зелёное')} tone="red" icon={<IconWheel size={22} />} model={TILE_MODELS.roulette} onClick={go({ name: 'roulette' })} />
        <GameTile title={t('Дайс')} sub={t('Свой шанс и множитель')} tone="cyan" icon={<IconDice size={22} />} model={TILE_MODELS.dice} onClick={go({ name: 'dice' })} />
        <GameTile title={t('Коинфлип')} sub={t('Один на один')} tone="blue" badge="PvP" icon={<IconCoin size={22} />} model={TILE_MODELS.coinflip} onClick={go({ name: 'coinflip' })} />
        <GameTile title={t('Контракты')} sub={t('Несколько в один')} tone="violet" icon={<IconLayers size={22} />} model={TILE_MODELS.contracts} onClick={go({ name: 'contracts' })} />
        <GameTile title={t('PvP-джекпот')} sub={t('Игроки против игроков')} tone="green" badge="PvP" icon={<IconCrown size={22} />} model={TILE_MODELS.jackpot} onClick={go({ name: 'jackpot' })} />
      </div>

      <div className="section-title">
        {t('Популярные кейсы')}
        <button type="button" className="link-btn" onClick={() => setTab('cases')}>
          {t('Все')}
        </button>
      </div>
      <div className="h-scroll">
        {cases.slice(0, 6).map((c) => (
          <CaseCard key={c.id} c={c} />
        ))}
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
