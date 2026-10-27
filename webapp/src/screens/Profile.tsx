import type { ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevron,
  IconClock,
  IconGlobe,
  IconPalette,
  IconHelp,
  IconMegaphone,
  IconShield,
  IconTasks,
  IconTicket,
  IconTrophy,
  IconUsers,
} from '../components/icons'
import { Money } from '../components/Money'
import { CHANNEL, REF_SHARE, RTP } from '../config'
import { BG_THEMES, CUSTOM_ID, useBackground } from '../lib/background'
import { LANGS, t, useLang } from '../lib/i18n'
import { botLink, channelLink } from '../lib/links'
import { getMe, openTg } from '../lib/telegram'
import { useNav } from '../state/nav'
import { useStore } from '../state/store'

function Row({ icon, label, value, onClick }: { icon: ReactNode; label: string; value?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={onClick}>
      <span className="menu-row__icon">{icon}</span>
      <span className="menu-row__label">{label}</span>
      {value && <span className="menu-row__value">{value}</span>}
      <IconChevron size={16} className="menu-row__chev" />
    </button>
  )
}

export function Profile() {
  const { balanceTon, openSheet, stats, inventory, promo } = useStore()
  const { open } = useNav()
  const { lang } = useLang()
  const { bg } = useBackground()
  const bgName = bg.id === CUSTOM_ID ? t('Свой') : t(BG_THEMES.find((th) => th.id === bg.id)?.name ?? '')
  const me = getMe()

  return (
    <div className="screen">
      <div className="profile-card">
        <Avatar name={me.name || t('Гость')} color="#7b5cff" size={64} photo={me.photo} />
        <div className="profile-card__info">
          <div className="profile-card__name">{me.name || t('Гость')}</div>
          {me.username && <div className="muted">@{me.username}</div>}
        </div>
      </div>

      <div className="balance-card balance-card--ton">
        <div className="balance-card__label">{t('Баланс')}</div>
        <Money ton={balanceTon} size={16} className="balance-card__value" />
      </div>

      <div className="row-2">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => openSheet('deposit')}>
          <IconArrowDown size={18} /> {t('Пополнить')}
        </button>
        <button type="button" className="btn btn--ghost btn--lg" onClick={() => openSheet('withdraw')}>
          <IconArrowUp size={18} /> {t('Вывести')}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat__value">{stats.bets}</div>
          <div className="stat__label">{t('Ставок')}</div>
        </div>
        <div className="stat">
          <Money ton={stats.wagered} size={14} className="stat__value" />
          <div className="stat__label">{t('Оборот')}</div>
        </div>
        <div className="stat">
          <Money ton={stats.bestWin} size={14} className="stat__value" />
          <div className="stat__label">{t('Лучший')}</div>
        </div>
        <div className="stat">
          <div className="stat__value">{inventory.length}</div>
          <div className="stat__label">{t('Подарков')}</div>
        </div>
      </div>

      <div className="menu">
        <Row icon={<IconTasks size={18} />} label={t('Задания')} onClick={() => open({ name: 'tasks' })} />
        <Row icon={<IconTrophy size={18} />} label={t('Турнир недели')} onClick={() => open({ name: 'tournament' })} />
        <Row icon={<IconUsers size={18} />} label={t('Пригласить друзей')} value={`${Math.round(REF_SHARE * 100)}%`} onClick={() => open({ name: 'referrals' })} />
        <Row icon={<IconTicket size={18} />} label={t('Промокод')} value={promo ?? undefined} onClick={() => openSheet('promo')} />
      </div>

      <div className="menu">
        <Row icon={<IconClock size={18} />} label={t('История операций')} onClick={() => open({ name: 'history' })} />
        <Row icon={<IconShield size={18} />} label={t('Честная игра')} value={`RTP ${Math.round(RTP * 100)}%`} onClick={() => open({ name: 'fair' })} />
        <Row icon={<IconPalette size={18} />} label={t('Фон')} value={bgName} onClick={() => openSheet('bg')} />
        <Row icon={<IconGlobe size={18} />} label={t('Язык')} value={LANGS.find((l) => l.id === lang)?.name} onClick={() => openSheet('lang')} />
        <Row icon={<IconMegaphone size={18} />} label={t('Канал проекта')} value={CHANNEL} onClick={() => openTg(channelLink())} />
        <Row icon={<IconHelp size={18} />} label={t('Поддержка')} onClick={() => openTg(botLink('support'))} />
      </div>


      <p className="note center">{t('18+ · Играйте ответственно. Ставьте только то, что готовы потерять.')}</p>
    </div>
  )
}
