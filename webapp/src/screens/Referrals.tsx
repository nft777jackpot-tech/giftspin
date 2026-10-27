import { Avatar } from '../components/Avatar'
import { IconCopy, IconSend, IconTicket } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { BRAND, REF_SHARE, RTP } from '../config'
import { REF_FRIENDS } from '../data/social'
import { fmtDate, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { refLink } from '../lib/links'
import { copyText, getMe, haptic, shareToChat } from '../lib/telegram'
import { useStore } from '../state/store'

export function Referrals() {
  const { refEarned, refClaimed, claimRef, openSheet, promo } = useStore()
  const me = getMe()
  const link = refLink(me.id)
  const available = Math.max(0, refEarned - refClaimed)
  const active = REF_FRIENDS.filter((f) => f.wagered > 0).length
  const turnover = REF_FRIENDS.reduce((s, f) => s + f.wagered, 0)
  const share = Math.round(REF_SHARE * 100)

  return (
    <div className="screen">
      <PageHead title={t('Пригласить друзей')} />

      <div className="ref-hero">
        <div className="ref-hero__label">{t('Ваш доход')}</div>
        <Money ton={refEarned} size={24} className="ref-hero__value" />
        <div className="ref-hero__sub">{t('{share}% нашей комиссии с каждой ставки друга, навсегда', { share })}</div>
        <button
          type="button"
          className="btn btn--success btn--block"
          disabled={available < 0.01}
          onClick={() => {
            const got = claimRef()
            haptic.success()
            toast(t('Зачислено на баланс: {n} TON', { n: fmtNum(got, 2) }), 'success')
          }}
        >
          {available >= 0.01 ? (
            <>
              {t('Забрать')} <Money ton={available} size={15} />
            </>
          ) : (
            t('Всё уже на балансе')
          )}
        </button>
      </div>

      <div className="stats stats--3">
        <div className="stat">
          <div className="stat__value">{REF_FRIENDS.length}</div>
          <div className="stat__label">{t('Приглашено')}</div>
        </div>
        <div className="stat">
          <div className="stat__value">{active}</div>
          <div className="stat__label">{t('Играют')}</div>
        </div>
        <div className="stat">
          <Money ton={turnover} size={13} className="stat__value" />
          <div className="stat__label">{t('Их оборот')}</div>
        </div>
      </div>

      <div className="row-2">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => {
            haptic.tap()
            shareToChat('invite', t('Заходи в {brand}: кейсы, батлы и краш на NFT-подарках', { brand: BRAND }), link)
          }}
        >
          <IconSend size={18} /> {t('Пригласить')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--lg"
          onClick={() => {
            copyText(link)
            haptic.success()
            toast(t('Ссылка скопирована'), 'success')
          }}
        >
          <IconCopy size={18} /> {t('Ссылка')}
        </button>
      </div>
      <code className="ref-link">
        <span>{link}</span>
      </code>

      <ol className="steps">
        <li>
          <div>{t('Отправьте ссылку другу или в чат')}</div>
        </li>
        <li>
          <div>{t('Друг запускает бота по ссылке и играет')}</div>
        </li>
        <li>
          <div>{t('Вы получаете {share}% от комиссии казино с его ставок. Это {pct}% от оборота друга.', { share, pct: fmtNum((1 - RTP) * REF_SHARE * 100, 1) })}</div>
        </li>
      </ol>

      <button type="button" className="menu-row menu-row--card" onClick={() => openSheet('promo')}>
        <span className="menu-row__icon">
          <IconTicket size={18} />
        </span>
        <span className="menu-row__label">{promo ? t('Промокод {code} активирован', { code: promo }) : t('Есть промокод от блогера?')}</span>
      </button>

      <div className="section-title">{t('Ваши друзья')}</div>
      <div className="panel players">
        {REF_FRIENDS.map((f) => (
          <div key={f.name} className="player-row">
            <Avatar name={f.name} color={f.color} size={30} />
            <div className="player-row__name">
              {f.name}
              <div className="muted small">{fmtDate(f.joinedAt)}</div>
            </div>
            <div className="ref-friend__nums">
              <Money ton={f.wagered} size={11} />
              <span className="pos small">+{fmtNum(f.wagered * (1 - RTP) * REF_SHARE, 2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
