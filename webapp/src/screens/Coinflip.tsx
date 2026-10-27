import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { BetInput } from '../components/BetInput'
import { FairLine } from '../components/FairLine'
import { GiftCard } from '../components/GiftCard'
import { GiftImg } from '../components/GiftImg'
import { StarIcon, TonIcon } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { RTP } from '../config'
import { getGift } from '../data/gifts'
import { type FakePlayer } from '../data/players'
import { newRound, roundFloats, type RoundSeed } from '../lib/fair'
import { t } from '../lib/i18n'
import { coinSide, giftFlipFee, type CoinSide } from '../lib/rtp'
import { getMe, haptic } from '../lib/telegram'
import { useStore, type InvItem } from '../state/store'

const FLIP_MS = 3200
const GIFT_TOLERANCE = 0.1

type Stake = { kind: 'ton'; amount: number } | { kind: 'gift'; gifts: { giftId: string; num: number }[]; value: number }

interface Game {
  id: string
  host: FakePlayer & { me?: boolean }
  side: CoinSide
  stake: Stake
  round: RoundSeed
  createdAt: number
}

interface Flip {
  game: Game
  guest: FakePlayer & { me?: boolean }
  guestStake: Stake
  result: CoinSide
  /** Выигравшие подарки, если игра на подарки. */
  prize: { giftId: string; num: number }[]
  done: boolean
}

let gameSeq = 0
const stakeValue = (s: Stake) => (s.kind === 'ton' ? s.amount : s.value)
const other = (s: CoinSide): CoinSide => (s === 'ton' ? 'star' : 'ton')

function SideIcon({ side, size = 18 }: { side: CoinSide; size?: number }) {
  return side === 'ton' ? <TonIcon size={size} /> : <StarIcon size={size} />
}

function StakeView({ stake }: { stake: Stake }) {
  if (stake.kind === 'ton') return <Money ton={stake.amount} size={13} />
  return (
    <span className="cf-stake">
      {stake.gifts.slice(0, 3).map((g, i) => (
        <GiftImg key={i} giftId={g.giftId} num={g.num} size={22} />
      ))}
      <Money ton={stake.value} size={12} />
    </span>
  )
}

export function Coinflip() {
  const { spend, credit, openSheet, inventory, removeItems, addItem } = useStore()
  const me = getMe()
  const meName = me.name || t('Вы')
  // Лобби: только игры реальных игроков. Пока сервера нет — лишь созданные вами, без ботов
  const [games, setGames] = useState<Game[]>([])
  const [mode, setMode] = useState<'ton' | 'gift'>('ton')
  const [bet, setBet] = useState(1)
  const [side, setSide] = useState<CoinSide>('ton')
  const [picked, setPicked] = useState<string[]>([])
  const [pickFor, setPickFor] = useState<Game | 'create' | null>(null)
  const [flip, setFlip] = useState<Flip | null>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const pickedItems = inventory.filter((i) => picked.includes(i.uid))
  const pickedValue = pickedItems.reduce((s, i) => s + getGift(i.giftId).price, 0)
  const giftStake = (items: InvItem[]): Stake => ({
    kind: 'gift',
    gifts: items.map((i) => ({ giftId: i.giftId, num: i.num })),
    value: items.reduce((s, i) => s + getGift(i.giftId).price, 0),
  })

  const startFlip = (game: Game, guest: Flip['guest'], guestStake: Stake) => {
    const result = coinSide(roundFloats(game.round.seed, 1)[0])
    const prize =
      game.stake.kind === 'gift' && guestStake.kind === 'gift' ? [...game.stake.gifts, ...guestStake.gifts] : []
    setGames((list) => list.filter((g) => g.id !== game.id))
    setFlip({ game, guest, guestStake, result, prize, done: false })
    haptic.heavy()
    later(() => {
      setFlip((f) => (f ? { ...f, done: true } : f))
      const iWin = (game.host.me && result === game.side) || (guest.me && result === other(game.side))
      const iPlay = game.host.me || guest.me
      if (!iPlay) return
      if (iWin) {
        if (prize.length) prize.forEach((p) => addItem(p.giftId, p.num))
        else credit((stakeValue(game.stake) + stakeValue(guestStake)) * RTP, t('Коинфлип'))
        haptic.success()
        toast(t('Победа в коинфлипе!'), 'success')
      } else haptic.error()
    }, FLIP_MS)
  }

  /** Взнос за игру подарками списывается с баланса, сами подарки уходят в банк игры. */
  const payGiftFee = (value: number) => spend(giftFlipFee(value), t('Взнос за коинфлип'))

  const create = () => {
    let stake: Stake
    if (mode === 'ton') {
      if (!spend(bet, t('Коинфлип'))) {
        haptic.error()
        openSheet('deposit')
        return
      }
      stake = { kind: 'ton', amount: bet }
    } else {
      if (!pickedItems.length) {
        setPickFor('create')
        return
      }
      if (!payGiftFee(pickedValue)) {
        haptic.error()
        openSheet('deposit')
        return
      }
      stake = giftStake(pickedItems)
      removeItems(picked)
      setPicked([])
    }
    const game: Game = { id: `cf${++gameSeq}`, host: { id: 'me', name: meName, color: '#2ea7ff', me: true }, side, stake, round: newRound(), createdAt: Date.now() }
    setGames((list) => [game, ...list])
    haptic.tap()
    // Игра ждёт реального соперника. Матчинг появится, когда игры переедут на сервер
  }

  const join = (game: Game) => {
    if (flip && !flip.done) return
    if (game.stake.kind === 'ton') {
      if (!spend(game.stake.amount, t('Коинфлип'))) {
        haptic.error()
        openSheet('deposit')
        return
      }
      startFlip(game, { id: 'me', name: meName, color: '#2ea7ff', me: true }, game.stake)
      return
    }
    setPicked([])
    setPickFor(game)
  }

  const target = pickFor && pickFor !== 'create' ? pickFor.stake.kind === 'gift' ? pickFor.stake.value : 0 : 0
  const fits = pickFor === 'create' ? pickedItems.length > 0 : Math.abs(pickedValue - target) <= target * GIFT_TOLERANCE

  const confirmGifts = () => {
    if (!pickFor || !fits) return
    if (pickFor === 'create') {
      setPickFor(null)
      return
    }
    if (!payGiftFee(pickedValue)) {
      haptic.error()
      openSheet('deposit')
      return
    }
    const stake = giftStake(pickedItems)
    removeItems(picked)
    setPicked([])
    const game = pickFor
    setPickFor(null)
    startFlip(game, { id: 'me', name: meName, color: '#2ea7ff', me: true }, stake)
  }

  const mine = games.filter((g) => g.host.me)
  const open = games.filter((g) => !g.host.me)

  return (
    <div className="screen">
      <PageHead title={t('Коинфлип')} />

      <div className="panel">
        <div className="seg">
          <button type="button" className={mode === 'ton' ? 'is-active' : ''} onClick={() => setMode('ton')}>
            {t('На баланс')}
          </button>
          <button type="button" className={mode === 'gift' ? 'is-active' : ''} onClick={() => setMode('gift')}>
            {t('На подарки')}
          </button>
        </div>
        {mode === 'ton' ? (
          <BetInput value={bet} onChange={setBet} />
        ) : (
          <button type="button" className="gift-pick" onClick={() => setPickFor('create')}>
            {pickedItems.length ? (
              <>
                <span className="gift-pick__imgs">
                  {pickedItems.slice(0, 4).map((i) => (
                    <GiftImg key={i.uid} giftId={i.giftId} num={i.num} size={30} />
                  ))}
                </span>
                <Money ton={pickedValue} size={14} />
                <span className="muted small">
                  {t('взнос')} <Money ton={giftFlipFee(pickedValue)} size={11} />
                </span>
              </>
            ) : (
              <span className="muted">{t('Выбрать подарки')}</span>
            )}
          </button>
        )}
        <div className="cf-sides">
          {(['ton', 'star'] as CoinSide[]).map((s) => (
            <button key={s} type="button" className={`cf-side ${side === s ? 'is-active' : ''}`} onClick={() => setSide(s)}>
              <SideIcon side={s} size={26} />
              <span>{s === 'ton' ? 'TON' : 'Star'}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={create}>
          {t('Создать игру')}
        </button>
      </div>

      {mine.length > 0 && (
        <>
          <div className="section-title">{t('Ваши игры')}</div>
          <div className="cf-list">
            {mine.map((g) => (
              <div key={g.id} className="cf-row is-me">
                <Avatar name={g.host.name} color={g.host.color} size={32} photo={me.photo} />
                <div className="cf-row__main">
                  <b>{t('Ждём соперника…')}</b>
                  <StakeView stake={g.stake} />
                </div>
                <SideIcon side={g.side} size={22} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        {t('Открытые игры')}
        <span className="muted small">{open.length}</span>
      </div>
      <div className="cf-list">
        {open.map((g) => (
          <div key={g.id} className="cf-row">
            <Avatar name={g.host.name} color={g.host.color} size={32} />
            <div className="cf-row__main">
              <b>{g.host.name}</b>
              <StakeView stake={g.stake} />
            </div>
            <span className="cf-row__side" title={t('Сторона создателя')}>
              <SideIcon side={g.side} size={20} />
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => join(g)}>
              {t('Войти')}
            </button>
          </div>
        ))}
      </div>

      <p className="note">
        {t('Победитель забирает обе ставки. В играх на TON комиссия {fee}% берётся из банка, в играх на подарки — небольшим взносом при входе. Подарки соперника должны стоить столько же ±10%.', {
          fee: Math.round((1 - RTP) * 100),
        })}
      </p>

      <Sheet open={!!pickFor} title={t('Выберите подарки')} onClose={() => setPickFor(null)}>
        {pickFor && pickFor !== 'create' && pickFor.stake.kind === 'gift' && (
          <div className="kv">
            <span>{t('Нужно на сумму')}</span>
            <b>
              <Money ton={target * (1 - GIFT_TOLERANCE)} size={12} /> – <Money ton={target * (1 + GIFT_TOLERANCE)} size={12} />
            </b>
          </div>
        )}
        {inventory.length ? (
          <div className="gift-grid">
            {inventory.map((i) => (
              <GiftCard
                key={i.uid}
                giftId={i.giftId}
                num={i.num}
                selected={picked.includes(i.uid)}
                onClick={() => {
                  haptic.select()
                  setPicked((p) => (p.includes(i.uid) ? p.filter((x) => x !== i.uid) : [...p, i.uid]))
                }}
              />
            ))}
          </div>
        ) : (
          <div className="empty">{t('В инвентаре нет подарков')}</div>
        )}
        <div className="sheet__footer">
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!fits} onClick={confirmGifts}>
            {pickFor === 'create' ? t('Готово') : t('Войти в игру')} · <Money ton={pickedValue} size={15} />
          </button>
        </div>
      </Sheet>

      {flip && (
        <div className="modal-root" role="dialog" aria-modal="true" aria-label={t('Коинфлип')}>
          <div className="modal-backdrop" />
          <div className="modal cf-modal">
            <div className="cf-duel">
              {[
                { p: flip.game.host, s: flip.game.side, stake: flip.game.stake },
                { p: flip.guest, s: other(flip.game.side), stake: flip.guestStake },
              ].map(({ p, s, stake }) => (
                <div key={p.id} className={`cf-player ${flip.done ? (flip.result === s ? 'is-win' : 'is-lose') : ''}`}>
                  <Avatar name={p.name} color={p.color} size={48} photo={p.me ? me.photo : undefined} />
                  <b>{p.me ? t('Вы') : p.name}</b>
                  <SideIcon side={s} size={18} />
                  <StakeView stake={stake} />
                </div>
              ))}
              <div className={`coin ${flip.done ? '' : 'is-flipping'} coin--${flip.result}`}>
                <div className="coin__face coin__face--ton">
                  <TonIcon size={56} />
                </div>
                <div className="coin__face coin__face--star">
                  <StarIcon size={56} />
                </div>
              </div>
            </div>
            <div className="modal__title">
              {!flip.done
                ? t('Подбрасываем…')
                : (flip.game.host.me && flip.result === flip.game.side) || (flip.guest.me && flip.result !== flip.game.side)
                  ? t('Вы победили!')
                  : flip.game.host.me || flip.guest.me
                    ? t('Не повезло')
                    : t('Игра завершена')}
            </div>
            {flip.done && flip.prize.length > 0 && (
              <div className="cf-prize">
                {flip.prize.map((p, i) => (
                  <GiftImg key={i} giftId={p.giftId} num={p.num} size={44} />
                ))}
              </div>
            )}
            <FairLine
              hash={flip.game.round.hash}
              verify={flip.done ? { game: 'coinflip', seed: flip.game.round.seed } : undefined}
            />
            <div className="modal__actions">
              <button type="button" className="btn btn--primary" disabled={!flip.done} onClick={() => setFlip(null)}>
                {t('Продолжить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
