import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { IconClock, IconTrophy } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { TOURNAMENT_POOL, TOURNAMENT_SPLIT } from '../config'
import { weeklyLeaders, weekStart } from '../data/social'
import { fmtCountdown, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { getMe } from '../lib/telegram'
import { useStore } from '../state/store'

const WEEK = 7 * 86400000
const SHOWN = 30

export function Tournament() {
  const { stats } = useStore()
  const me = getMe()
  const [now, setNow] = useState(Date.now())
  const start = weekStart(now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Рейтинг собирается из реальных игроков на сервере. Пока его нет — только вы, если делали ставки
  const leaders = useMemo(() => weeklyLeaders(), [])
  const myPoints = Math.round(stats.wageredWeek * 100) / 100
  const myRank = leaders.filter((l) => l.points > myPoints).length + 1
  const prize = (rank: number) => (rank <= TOURNAMENT_SPLIT.length ? TOURNAMENT_POOL * TOURNAMENT_SPLIT[rank - 1] : 0)

  return (
    <div className="screen">
      <PageHead title={t('Турнир недели')} />

      <div className="tour-hero">
        <IconTrophy size={34} className="tour-hero__icon" />
        <div className="tour-hero__label">{t('Призовой фонд')}</div>
        <Money ton={TOURNAMENT_POOL} size={26} className="tour-hero__pool" />
        <div className="tour-hero__timer">
          <IconClock size={14} /> {t('До конца недели')} · {fmtCountdown(start + WEEK - now)}
        </div>
      </div>

      <div className="tour-me">
        <Avatar name={me.name || t('Вы')} color="#2ea7ff" size={40} photo={me.photo} />
        <div className="tour-me__main">
          <b>{myPoints > 0 ? t('Ваше место: {n}', { n: myRank }) : t('Вы ещё не в таблице')}</b>
          <span className="muted small">
            {myPoints > 0 ? t('{points} очков', { points: fmtNum(myPoints, 2) }) : t('Сделайте любую ставку, чтобы попасть в рейтинг')}
          </span>
        </div>
        {prize(myRank) > 0 && myPoints > 0 && <Money ton={prize(myRank)} size={14} />}
      </div>

      <div className="section-title">{t('Призы')}</div>
      <div className="tour-prizes">
        {TOURNAMENT_SPLIT.map((s, i) => (
          <div key={i} className={`tour-prize tour-prize--${i < 3 ? i + 1 : 'n'}`}>
            <span>#{i + 1}</span>
            <Money ton={TOURNAMENT_POOL * s} size={12} />
          </div>
        ))}
      </div>

      <div className="section-title">{t('Рейтинг')}</div>
      <div className="panel players">
        {leaders.length === 0 && myPoints <= 0 && <div className="empty">{t('Пока никто не играл на этой неделе')}</div>}
        {leaders.length === 0 && myPoints > 0 && (
          <div className="player-row is-me">
            <span className="tour-rank">1</span>
            <Avatar name={me.name || t('Вы')} color="#2ea7ff" size={28} photo={me.photo} />
            <span className="player-row__name">{t('Вы')}</span>
            <span className="tour-points">{fmtNum(myPoints, 1)}</span>
          </div>
        )}
        {leaders.slice(0, SHOWN).map((l, i) => {
          const rank = i + 1
          const showMe = myPoints > 0 && rank === myRank
          return (
            <div key={i}>
              {showMe && (
                <div className="player-row is-me">
                  <span className="tour-rank">{myRank}</span>
                  <Avatar name={me.name || t('Вы')} color="#2ea7ff" size={28} photo={me.photo} />
                  <span className="player-row__name">{t('Вы')}</span>
                  <span className="tour-points">{fmtNum(myPoints, 1)}</span>
                </div>
              )}
              <div className="player-row">
                <span className="tour-rank">{rank + (myPoints > 0 && rank >= myRank ? 1 : 0)}</span>
                <Avatar name={l.name} color={l.color} size={28} />
                <span className="player-row__name">{l.name}</span>
                <span className="tour-points">{fmtNum(l.points)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="note">{t('Очки — ваш оборот за неделю в TON по курсу на момент ставки. Неделя начинается в понедельник в 00:00 UTC, призы зачисляются на баланс автоматически.')}</p>
    </div>
  )
}
