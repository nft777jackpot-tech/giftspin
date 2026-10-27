import { useMemo, useState } from 'react'
import { BetInput } from '../components/BetInput'
import { GiftCard } from '../components/GiftCard'
import { GiftImg } from '../components/GiftImg'
import { IconPlus } from '../components/icons'
import { Money } from '../components/Money'
import { WinModal } from '../components/WinModal'
import { getGift, randomNum } from '../data/gifts'
import { fmtChance } from '../lib/format'
import { UPGRADE_MAX_CHANCE, upgradeChance } from '../lib/rtp'
import { haptic } from '../lib/telegram'
import { useNav } from '../state/nav'
import { useStore, type InvItem } from '../state/store'

const MULTS = [1.5, 2, 3, 5, 10]
const MAX_STAKE_ITEMS = 6
const R = 92
const CIRC = 2 * Math.PI * R

type Source = 'gifts' | 'balance'
type Phase = 'idle' | 'spinning' | 'win' | 'lose'

export function Upgrade() {
  const { inventory, catalog, spend, addItem, removeItems, openSheet } = useStore()
  const { setTab } = useNav()
  const [source, setSource] = useState<Source>('gifts')
  const [picked, setPicked] = useState<string[]>([])
  const [betTon, setBetTon] = useState(2)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [list, setList] = useState<'mine' | 'target'>('mine')
  const [phase, setPhase] = useState<Phase>('idle')
  const [angle, setAngle] = useState(0)
  const [won, setWon] = useState<InvItem | null>(null)
  // Во время прокрутки ставка уже списана, поэтому показываем снимок на момент запуска
  const [frozen, setFrozen] = useState<{ stake: number; chance: number; items: InvItem[] } | null>(null)

  const stakeItems = inventory.filter((i) => picked.includes(i.uid))
  const stake = source === 'gifts' ? stakeItems.reduce((s, i) => s + getGift(i.giftId).price, 0) : betTon
  const target = targetId ? getGift(targetId) : null
  const chance = target ? upgradeChance(stake, target.price) : 0
  const shownChance = frozen?.chance ?? chance
  const shownStake = frozen?.stake ?? stake
  const slotItems = frozen?.items ?? stakeItems

  // Цели с витрины, которые дороже ставки и не упираются в потолок шанса
  const targets = useMemo(
    () => catalog.filter((g) => stake > 0 && upgradeChance(stake, g.price) < UPGRADE_MAX_CHANCE).sort((a, b) => a.price - b.price),
    [stake, catalog],
  )

  const pickMult = (m: number) => {
    if (!targets.length) return
    const want = stake * m
    const best = targets.reduce((a, b) => (Math.abs(b.price - want) < Math.abs(a.price - want) ? b : a))
    setTargetId(best.id)
    haptic.select()
  }

  const togglePick = (uid: string) => {
    haptic.select()
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length >= MAX_STAKE_ITEMS ? p : [...p, uid]))
  }

  const canSpin = phase === 'idle' && !!target && stake > 0 && target.price > stake
  const spin = () => {
    if (!canSpin || !target) return
    if (source === 'balance') {
      if (!spend(stake, `Апгрейд на ${target.name}`)) {
        haptic.error()
        openSheet('deposit')
        return
      }
    } else {
      removeItems(picked)
      setPicked([])
    }
    setFrozen({ stake, chance, items: source === 'gifts' ? stakeItems : [] })
    haptic.heavy()
    const win = Math.random() < chance
    // Стрелка останавливается внутри зелёной дуги при выигрыше и вне её при проигрыше
    const arc = chance * 360
    const land = win ? arc * (0.08 + Math.random() * 0.84) : arc + (360 - arc) * (0.04 + Math.random() * 0.92)
    const base = angle - (angle % 360)
    setAngle(base + 360 * 5 + land)
    setPhase('spinning')
    window.setTimeout(() => {
      if (win) {
        setWon(addItem(target.id, randomNum()))
        haptic.success()
        setPhase('win')
      } else {
        haptic.error()
        setPhase('lose')
      }
    }, 4300)
  }

  const reset = () => {
    setFrozen(null)
    setPhase('idle')
    setWon(null)
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Апгрейд</h1>
      <p className="screen-sub">Поставьте подарки или TON и выберите подарок дороже</p>

      <div className="upgrade-dial">
        <svg viewBox="0 0 220 220" className="upgrade-dial__svg" aria-hidden>
          <defs>
            <linearGradient id="arc-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22d68a" />
              <stop offset="1" stopColor="#3fe0c5" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="110" r={R} className="upgrade-dial__track" />
          <circle
            cx="110"
            cy="110"
            r={R}
            className="upgrade-dial__arc"
            stroke="url(#arc-g)"
            strokeDasharray={`${shownChance * CIRC} ${CIRC}`}
            transform="rotate(-90 110 110)"
          />
          <g
            className="upgrade-dial__needle"
            style={{
              transform: `rotate(${angle}deg)`,
              transition: phase === 'spinning' ? 'transform 4.2s cubic-bezier(0.15, 0.7, 0.1, 1)' : 'none',
            }}
          >
            <path d="M110 6 L118 24 L102 24 Z" />
          </g>
        </svg>
        <div className="upgrade-dial__center">
          <div className={`upgrade-dial__pct ${phase === 'win' ? 'is-win' : phase === 'lose' ? 'is-lose' : ''}`}>
            {fmtChance(shownChance)}
          </div>
          <div className="upgrade-dial__label">шанс</div>
        </div>
      </div>

      <div className="upgrade-slots">
        <div className="upgrade-slot">
          <div className="upgrade-slot__label">Ставка</div>
          {source === 'gifts' && slotItems.length > 0 ? (
            <div className={`upgrade-slot__stack n${Math.min(slotItems.length, 3)}`}>
              {slotItems.slice(0, 3).map((i) => (
                <GiftImg key={i.uid} giftId={i.giftId} num={i.num} />
              ))}
            </div>
          ) : source === 'balance' ? (
            <div className="upgrade-slot__empty upgrade-slot__empty--coin">
              <Money ton={shownStake} size={22} />
            </div>
          ) : (
            <div className="upgrade-slot__empty">
              <IconPlus size={22} />
            </div>
          )}
          <Money ton={shownStake} size={13} className="upgrade-slot__value" />
        </div>
        <div className="upgrade-slots__arrow">→</div>
        <div className="upgrade-slot upgrade-slot--target">
          <div className="upgrade-slot__label">Цель</div>
          {target ? (
            <div className="upgrade-slot__stack n1">
              <GiftImg giftId={target.id} />
            </div>
          ) : (
            <div className="upgrade-slot__empty">
              <IconPlus size={22} />
            </div>
          )}
          {target ? <Money ton={target.price} size={13} className="upgrade-slot__value" /> : <span className="upgrade-slot__value muted">не выбрана</span>}
        </div>
      </div>

      <div className="seg">
        <button type="button" className={source === 'gifts' ? 'is-active' : ''} onClick={() => setSource('gifts')}>
          Подарками
        </button>
        <button type="button" className={source === 'balance' ? 'is-active' : ''} onClick={() => setSource('balance')}>
          С баланса
        </button>
      </div>
      {source === 'balance' && <BetInput value={betTon} onChange={setBetTon} disabled={phase === 'spinning'} />}

      <div className="mult-row">
        {MULTS.map((m) => (
          <button key={m} type="button" className="chip" disabled={stake <= 0} onClick={() => pickMult(m)}>
            x{m}
          </button>
        ))}
      </div>

      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!canSpin} onClick={spin}>
        {phase === 'spinning' ? 'Крутим…' : target ? `Улучшить · ${fmtChance(chance)}` : 'Выберите цель'}
      </button>

      <div className="seg seg--tabs">
        <button type="button" className={list === 'mine' ? 'is-active' : ''} onClick={() => setList('mine')}>
          Мои подарки
        </button>
        <button type="button" className={list === 'target' ? 'is-active' : ''} onClick={() => setList('target')}>
          Выбрать цель
        </button>
      </div>

      {list === 'mine' ? (
        inventory.length ? (
          <div className="gift-grid">
            {inventory.map((i) => (
              <GiftCard
                key={i.uid}
                giftId={i.giftId}
                num={i.num}
                selected={picked.includes(i.uid)}
                dim={source === 'balance'}
                onClick={source === 'gifts' && phase !== 'spinning' ? () => togglePick(i.uid) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>В инвентаре пусто</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab('cases')}>
              Открыть кейс
            </button>
          </div>
        )
      ) : stake > 0 && !targets.length ? (
        <div className="empty">
          <p>На складе нет подарков дороже ставки</p>
        </div>
      ) : stake > 0 ? (
        <div className="gift-grid">
          {targets.map((g) => (
            <GiftCard
              key={g.id}
              giftId={g.id}
              selected={g.id === targetId}
              onClick={phase !== 'spinning' ? () => { haptic.select(); setTargetId(g.id) } : undefined}
              footer={
                <div className="gift-card__meta">
                  <Money ton={g.price} size={12} />
                  <span className="chance">{fmtChance(upgradeChance(stake, g.price))}</span>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>Сначала выберите ставку</p>
        </div>
      )}

      <WinModal open={phase === 'win'} title="Апгрейд удался!" giftId={won?.giftId} num={won?.num}>
        <button type="button" className="btn btn--primary btn--block" onClick={reset}>
          Отлично
        </button>
      </WinModal>
      <WinModal open={phase === 'lose'} title="Не повезло" lost amount={-shownStake}>
        <button type="button" className="btn btn--primary btn--block" onClick={reset}>
          Попробовать ещё
        </button>
      </WinModal>
    </div>
  )
}
