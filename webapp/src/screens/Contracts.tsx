import { useMemo, useState } from 'react'
import { GiftCard } from '../components/GiftCard'
import { GiftImg } from '../components/GiftImg'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { WinModal } from '../components/WinModal'
import { RTP } from '../config'
import { getGift } from '../data/gifts'
import { fmtChance } from '../lib/format'
import { t } from '../lib/i18n'
import { CONTRACT_MAX, CONTRACT_MIN, contractPool, pickIndex } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useNav } from '../state/nav'
import { useStore, type InvItem } from '../state/store'

const FUSE_MS = 2600

type Phase = 'idle' | 'fusing' | 'done'

export function Contracts() {
  const { inventory, catalog, removeItems, addItem, sellItems, roll, logRound } = useStore()
  const { setTab } = useNav()
  const [picked, setPicked] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [fusing, setFusing] = useState<InvItem[]>([])
  const [won, setWon] = useState<InvItem | null>(null)

  const items = inventory.filter((i) => picked.includes(i.uid))
  const total = items.reduce((s, i) => s + getGift(i.giftId).price, 0)
  const pool = useMemo(() => (items.length >= CONTRACT_MIN ? contractPool(total, catalog) : []), [total, items.length, catalog])
  const ready = items.length >= CONTRACT_MIN && pool.length > 0 && phase === 'idle'
  const top = [...pool].sort((a, b) => b.gift.price - a.gift.price)

  const toggle = (uid: string) => {
    if (phase !== 'idle') return
    haptic.select()
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length >= CONTRACT_MAX ? p : [...p, uid]))
  }

  const sign = () => {
    if (!ready) return
    const r = roll(1)
    const gift = pool[pickIndex(pool.map((p) => p.chance), r.floats[0])].gift
    removeItems(picked)
    setFusing(items)
    setPicked([])
    setPhase('fusing')
    haptic.heavy()
    logRound({
      game: 'contract',
      title: t('Контракт на {n} подарков', { n: items.length }),
      nonce: r.nonce,
      clientSeed: r.clientSeed,
      hash: r.hash,
      params: { total: +total.toFixed(4) },
      result: gift.name,
    })
    window.setTimeout(() => {
      setWon(addItem(gift.id))
      setPhase('done')
      haptic.success()
    }, FUSE_MS)
  }

  return (
    <div className="screen">
      <PageHead title={t('Контракты')} />
      <p className="screen-sub">{t('Сдайте от {min} до {max} подарков и получите один случайный', { min: CONTRACT_MIN, max: CONTRACT_MAX })}</p>

      <div className={`contract-core ${phase === 'fusing' ? 'is-fusing' : ''}`}>
        <div className="contract-core__ring" />
        {(phase === 'fusing' ? fusing : items).slice(0, CONTRACT_MAX).map((i, k, arr) => (
          <div
            key={i.uid}
            className="contract-core__item"
            style={{ transform: `rotate(${(360 / arr.length) * k}deg) translateY(-92px) rotate(${-(360 / arr.length) * k}deg)` }}
          >
            <GiftImg giftId={i.giftId} num={i.num} />
          </div>
        ))}
        <div className="contract-core__center">
          <div className="contract-core__count">
            {items.length || fusing.length} / {CONTRACT_MAX}
          </div>
          <Money ton={phase === 'fusing' ? fusing.reduce((s, i) => s + getGift(i.giftId).price, 0) : total} size={16} />
        </div>
      </div>

      {items.length >= CONTRACT_MIN && (
        pool.length ? (
          <div className="panel">
            <div className="kv">
              <span>{t('Можно получить')}</span>
              <b>
                <Money ton={pool[0].gift.price} size={12} /> – <Money ton={top[0].gift.price} size={12} />
              </b>
            </div>
            <div className="kv">
              <span>{t('Средний результат')}</span>
              <b>
                <Money ton={total * RTP} size={12} />
              </b>
            </div>
            <div className="contract-odds">
              {top.map((p) => (
                <div key={p.gift.id} className="contract-odds__item">
                  <GiftImg giftId={p.gift.id} size={40} />
                  <span className="chance">{fmtChance(p.chance)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty empty--inline">{t('Под такую сумму нет подходящих подарков. Уберите самые дорогие.')}</div>
        )
      )}

      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!ready} onClick={sign}>
        {phase === 'fusing'
          ? t('Подписываем…')
          : items.length < CONTRACT_MIN
            ? t('Выберите ещё {n}', { n: CONTRACT_MIN - items.length })
            : t('Подписать контракт')}
      </button>

      <div className="section-title">{t('Мои подарки')}</div>
      {inventory.length ? (
        <div className="gift-grid">
          {[...inventory]
            .sort((a, b) => getGift(a.giftId).price - getGift(b.giftId).price)
            .map((i) => (
              <GiftCard key={i.uid} giftId={i.giftId} num={i.num} selected={picked.includes(i.uid)} onClick={() => toggle(i.uid)} />
            ))}
        </div>
      ) : (
        <div className="empty">
          <p>{t('В инвентаре пусто')}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab('cases')}>
            {t('Открыть кейс')}
          </button>
        </div>
      )}

      <WinModal open={phase === 'done' && !!won} title={t('Контракт выполнен')} giftId={won?.giftId} num={won?.num}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            if (won) sellItems([won.uid])
            setPhase('idle')
            setFusing([])
          }}
        >
          {t('Продать')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setPhase('idle')
            setFusing([])
          }}
        >
          {t('Забрать')}
        </button>
      </WinModal>
    </div>
  )
}
