import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { caseName } from '../components/CaseCard'
import { GiftCard } from '../components/GiftCard'
import { GiftImg } from '../components/GiftImg'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { WinModal } from '../components/WinModal'
import type { CaseDef } from '../data/cases'
import { getGift, giftRarity, isCoin } from '../data/gifts'
import { fmtAmount, fmtChance } from '../lib/format'
import { t } from '../lib/i18n'
import { pickIndex } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useCase, useStore, type InvItem } from '../state/store'

const GAP = 8
const STRIP_LEN = 56
const WIN_INDEX = 48
const MAX_COUNT = 10
/** Ленты останавливаются по очереди, а не все разом. */
const STAGGER = { slow: 0.14, fast: 0.05 }

type Phase = 'idle' | 'spinning' | 'done'

/** Чем больше лент, тем они ниже, чтобы все помещались на экране. */
const cellFor = (count: number) => (count === 1 ? 92 : count <= 3 ? 72 : 54)

export function CaseView({ id }: { id: string }) {
  const c = useCase(id)
  if (!c) return <div className="screen"><div className="empty">{t('Кейс не найден')}</div></div>
  return <CaseOpen c={c} />
}

interface ReelProps {
  strip: string[]
  cell: number
  /** Номер прокрутки: 0 — лента стоит в покое, каждое новое значение запускает прокрутку. */
  spin: number
  seconds: number
  win: boolean
}

function Reel({ strip, cell, spin, seconds, win }: ReelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const step = cell + GAP
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)

  // В покое лента стоит так, чтобы по центру был тот же индекс, что и при выигрыше
  const center = (jitter = 0) => -(WIN_INDEX * step + cell / 2 - (ref.current?.clientWidth ?? 360) / 2 + jitter)

  useLayoutEffect(() => {
    setAnimate(false)
    if (!spin) {
      setOffset(center() + step * 20)
      return
    }
    // Сначала мгновенно возвращаем ленту в начало, потом запускаем прокрутку
    setOffset(0)
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setAnimate(true)
        setOffset(center((Math.random() - 0.5) * cell * 0.8))
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
    // Лента реагирует только на новую прокрутку и смену размера
  }, [spin, cell])

  return (
    <div className={`reel ${cell < 92 ? 'reel--compact' : ''}`} ref={ref}>
      <div className="reel__marker" />
      <div
        className="reel__track"
        style={{
          transform: `translate3d(${offset}px,0,0)`,
          transition: animate ? `transform ${seconds}s cubic-bezier(0.1, 0.75, 0.15, 1)` : 'none',
        }}
      >
        {strip.map((giftId, i) => (
          <div
            key={i}
            className={`reel__cell rarity-${giftRarity(giftId)} ${win && i === WIN_INDEX ? 'is-win' : ''}`}
            style={{ width: cell, height: cell }}
          >
            <GiftImg giftId={giftId} />
          </div>
        ))}
      </div>
    </div>
  )
}

function CaseOpen({ c }: { c: CaseDef }) {
  const { openCase, sellItems, openSheet } = useStore()
  const probs = useMemo(() => c.items.map((i) => i.chance), [c])
  const sorted = useMemo(() => [...c.items].sort((a, b) => getGift(b.giftId).price - getGift(a.giftId).price), [c])

  const randomStrip = () => Array.from({ length: STRIP_LEN }, () => c.items[pickIndex(probs)].giftId)
  const [count, setCount] = useState(1)
  const [strips, setStrips] = useState<string[][]>(() => [randomStrip()])
  const [spin, setSpin] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [fast, setFast] = useState(false)
  const [won, setWon] = useState<InvItem[]>([])

  const cell = cellFor(strips.length)
  const base = fast ? 1.2 : 5.4
  const stagger = fast ? STAGGER.fast : STAGGER.slow
  const title = `${t('Кейс')} «${caseName(c)}»`
  const wonValue = won.reduce((s, i) => s + getGift(i.giftId).price, 0)
  // Монеты уже зачислены на баланс, продавать можно только подарки
  const wonGifts = won.filter((i) => !isCoin(i.giftId))
  const giftsValue = wonGifts.reduce((s, i) => s + getGift(i.giftId).price, 0)
  const coinsValue = wonValue - giftsValue

  const pickCount = (n: number) => {
    if (phase === 'spinning') return
    haptic.select()
    setCount(n)
    setStrips(Array.from({ length: n }, randomStrip))
    setSpin(0)
    setPhase('idle')
  }

  const openCases = async () => {
    if (phase === 'spinning') return
    // Призы на сервере выбирает сам сервер, их исход можно проверить на странице честной игры
    const res = await openCase(c.id, count, title, title)
    if (res === 'insufficient') {
      haptic.error()
      openSheet('deposit')
      return
    }
    if (!res) return
    haptic.heavy()
    setStrips(
      res.reel.map((giftId) => {
        const s = randomStrip()
        s[WIN_INDEX] = giftId
        return s
      }),
    )
    setWon([])
    setSpin((n) => n + 1)
    setPhase('spinning')
    window.setTimeout(
      () => {
        setWon(res.reveal())
        setPhase('done')
        haptic.success()
      },
      (base + stagger * (count - 1)) * 1000 + 200,
    )
  }

  const close = () => {
    haptic.tap()
    setPhase('idle')
  }

  return (
    <div className="screen">
      <PageHead title={caseName(c)} />

      {count === 1 && (
        <div className="case-hero" style={{ '--accent': c.accent } as CSSProperties}>
          <div className="case-hero__glow" />
          <div className="case-hero__img">
            <GiftImg giftId={c.cover} />
          </div>
        </div>
      )}

      <div className="reels">
        {strips.map((strip, i) => (
          <Reel key={`${strips.length}-${i}`} strip={strip} cell={cell} spin={spin} seconds={base + stagger * i} win={phase === 'done'} />
        ))}
      </div>

      <div className="count-row" role="radiogroup" aria-label={t('Сколько кейсов открыть')}>
        {Array.from({ length: MAX_COUNT }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={count === n}
            className={`count-chip ${count === n ? 'is-active' : ''}`}
            disabled={phase === 'spinning'}
            onClick={() => pickCount(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="case-actions">
        <button type="button" className="btn btn--primary btn--lg" disabled={phase === 'spinning'} onClick={openCases}>
          {phase === 'spinning' ? (
            t('Открываем…')
          ) : (
            <>
              {count > 1 ? t('Открыть {n} за', { n: count }) : t('Открыть за')} <Money ton={c.price * count} size={16} />
            </>
          )}
        </button>
        <button type="button" className={`toggle ${fast ? 'is-on' : ''}`} onClick={() => setFast((f) => !f)} aria-pressed={fast}>
          <span className="toggle__dot" /> {t('Быстро')}
        </button>
      </div>

      <div className="section-title">{t('Содержимое кейса')}</div>
      <div className="gift-grid">
        {sorted.map((item) => (
          <GiftCard
            key={item.giftId}
            giftId={item.giftId}
            footer={
              <div className="gift-card__meta">
                <Money ton={getGift(item.giftId).price} size={12} />
                <span className="chance">{fmtChance(item.chance)}</span>
              </div>
            }
          />
        ))}
      </div>

      <WinModal
        open={phase === 'done' && won.length > 0}
        title={won.length > 1 ? t('Ваши выигрыши') : t('Ваш выигрыш')}
        giftId={won.length === 1 ? won[0].giftId : undefined}
        num={won.length === 1 ? won[0].num : undefined}
        items={won.length > 1 ? won : undefined}
        amount={won.length > 1 ? wonValue : undefined}
        note={coinsValue > 0 ? t('{amount} TON уже на балансе', { amount: fmtAmount(coinsValue) }) : undefined}
      >
        {wonGifts.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              sellItems(wonGifts.map((i) => i.uid))
              close()
            }}
          >
            {coinsValue > 0 ? t('Продать подарки за') : wonGifts.length > 1 ? t('Продать всё') : t('Продать за')} <Money ton={giftsValue} size={14} />
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={close}>
          {won.length > 1 ? t('Забрать всё') : t('Забрать')}
        </button>
      </WinModal>
    </div>
  )
}
