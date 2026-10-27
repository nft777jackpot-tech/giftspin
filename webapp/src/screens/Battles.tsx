import { useEffect, useState, type CSSProperties } from 'react'
import { Avatar } from '../components/Avatar'
import { caseName } from '../components/CaseCard'
import { GiftImg } from '../components/GiftImg'
import { IconClose, IconPlus } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { RTP } from '../config'
import { t } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { battleStage, MAX_ROUNDS, useBattles, type Battle } from '../state/battles'
import { useNav } from '../state/nav'
import { useStore } from '../state/store'

const SIZES = [2, 3, 4]
const modeLabel = (n: number) => Array.from({ length: n }, () => '1').join('×')

function BattleCard({ b, now }: { b: Battle; now: number }) {
  const { cases } = useStore()
  const { open } = useNav()
  const { join } = useBattles()
  const { openSheet } = useStore()
  const { stage, round } = battleStage(b, now)
  const mine = b.seats.some((s) => s?.me)
  const list = b.caseIds.map((id) => cases.find((c) => c.id === id)!)

  const enter = () => {
    haptic.tap()
    if (stage === 'waiting' && !mine) {
      if (!join(b.id)) {
        haptic.error()
        openSheet('deposit')
        return
      }
    }
    open({ name: 'battle', id: b.id })
  }

  return (
    <div className={`battle-card ${mine ? 'is-mine' : ''}`}>
      <div className="battle-card__cases">
        {list.slice(0, 6).map((c, i) => (
          <span key={i} className={`battle-card__case ${stage === 'rolling' && i === round ? 'is-current' : ''}`} style={{ '--accent': c.accent } as CSSProperties}>
            <GiftImg giftId={c.cover} />
          </span>
        ))}
        {list.length > 6 && <span className="muted small">+{list.length - 6}</span>}
      </div>
      <div className="battle-card__seats">
        {b.seats.map((s, i) =>
          s ? (
            <Avatar key={i} name={s.name} color={s.color} size={28} />
          ) : (
            <span key={i} className="battle-card__empty">
              <IconPlus size={14} />
            </span>
          ),
        )}
        <span className="battle-card__mode">{modeLabel(b.seats.length)}</span>
      </div>
      <div className="battle-card__foot">
        <div>
          <Money ton={b.cost} size={14} />
          <span className="muted small">
            {stage === 'waiting'
              ? t('ждёт игроков')
              : stage === 'done'
                ? t('завершён')
                : t('раунд {r} из {n}', { r: Math.min(round + 1, b.caseIds.length), n: b.caseIds.length })}
          </span>
        </div>
        <button type="button" className={`btn btn--sm ${stage === 'waiting' && !mine ? 'btn--primary' : 'btn--ghost'}`} onClick={enter}>
          {stage === 'waiting' && !mine ? t('Войти') : t('Смотреть')}
        </button>
      </div>
    </div>
  )
}

export function Battles() {
  const { cases, openSheet } = useStore()
  const { battles, create } = useBattles()
  const { open } = useNav()
  const [size, setSize] = useState(2)
  const [picked, setPicked] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  const pickable = cases.filter((c) => !c.event || c.event.endsAt > now)
  const cost = picked.reduce((s, id) => s + cases.find((c) => c.id === id)!.price, 0)

  const submit = () => {
    if (!picked.length) return
    const id = create(picked, size)
    if (!id) {
      haptic.error()
      openSheet('deposit')
      return
    }
    haptic.heavy()
    setPicked([])
    open({ name: 'battle', id })
  }

  const sorted = [...battles].sort((a, b) => {
    const am = a.seats.some((s) => s?.me) ? 0 : 1
    const bm = b.seats.some((s) => s?.me) ? 0 : 1
    return am - bm || (a.startedAt ? 1 : 0) - (b.startedAt ? 1 : 0) || b.createdAt - a.createdAt
  })

  return (
    <div className="screen">
      <PageHead title={t('Кейс-батлы')} />
      <p className="screen-sub">{t('Все открывают одинаковые кейсы. Кто выбил дороже, забирает подарки всех участников.')}</p>

      <div className="panel">
        <div className="seg">
          {SIZES.map((n) => (
            <button key={n} type="button" className={size === n ? 'is-active' : ''} onClick={() => setSize(n)}>
              {modeLabel(n)}
            </button>
          ))}
        </div>
        <div className="battle-pick">
          {pickable.map((c) => {
            const count = picked.filter((id) => id === c.id).length
            return (
              <button
                key={c.id}
                type="button"
                className={`battle-pick__case ${count ? 'is-active' : ''}`}
                style={{ '--accent': c.accent } as CSSProperties}
                disabled={picked.length >= MAX_ROUNDS}
                onClick={() => {
                  haptic.select()
                  setPicked((p) => [...p, c.id])
                }}
              >
                {count > 0 && <span className="battle-pick__count">{count}</span>}
                <span className="battle-pick__img">
                  <GiftImg giftId={c.cover} />
                </span>
                <span className="battle-pick__name">{caseName(c)}</span>
                <Money ton={c.price} size={11} />
              </button>
            )
          })}
        </div>
        {picked.length > 0 && (
          <div className="battle-seq">
            {picked.map((id, i) => {
              const c = cases.find((x) => x.id === id)!
              return (
                <button key={i} type="button" className="battle-seq__item" onClick={() => setPicked((p) => p.filter((_, k) => k !== i))} aria-label={t('Убрать')}>
                  <GiftImg giftId={c.cover} size={26} />
                  <IconClose size={12} />
                </button>
              )
            })}
          </div>
        )}
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!picked.length} onClick={submit}>
          {picked.length ? (
            <>
              {t('Создать батл')} · <Money ton={cost} size={16} />
            </>
          ) : (
            t('Добавьте кейсы')
          )}
        </button>
      </div>

      <div className="section-title">
        {t('Активные батлы')}
        <span className="muted small">{battles.length}</span>
      </div>
      <div className="battle-list">
        {sorted.map((b) => (
          <BattleCard key={b.id} b={b} now={now} />
        ))}
      </div>

      <p className="note">{t('Каждый кейс возвращает в среднем {rtp}% цены, поэтому и батл в среднем возвращает {rtp}% стоимости участия. При ничьей победителя выбирает сид раунда.', { rtp: Math.round(RTP * 100) })}</p>
    </div>
  )
}
