import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { Avatar } from '../components/Avatar'
import { caseName } from '../components/CaseCard'
import { FairLine } from '../components/FairLine'
import { GiftImg } from '../components/GiftImg'
import { IconCrown, IconPlus } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { WinModal } from '../components/WinModal'
import type { CaseDef } from '../data/cases'
import { giftRarity } from '../data/gifts'
import { t } from '../lib/i18n'
import { pickIndex } from '../lib/rtp'
import { getMe, haptic } from '../lib/telegram'
import { battleStage, COUNTDOWN_MS, ROUND_MS, seatTotal, useBattles } from '../state/battles'
import { useNav } from '../state/nav'
import { useStore } from '../state/store'

const STRIP = 26
const WIN_AT = 21
const REEL_MS = ROUND_MS - 800

/** Вертикальная лента одного места в одном раунде. Пересоздаётся на каждый раунд. */
function Reel({ c, winGiftId, cell }: { c: CaseDef; winGiftId: string; cell: number }) {
  const strip = useMemo(() => {
    const probs = c.items.map((i) => i.chance)
    const s = Array.from({ length: STRIP }, () => c.items[pickIndex(probs)].giftId)
    s[WIN_AT] = winGiftId
    return s
  }, [c, winGiftId])
  const [y, setY] = useState(0)
  const [go, setGo] = useState(false)

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setGo(true)
        setY(-(WIN_AT * cell) + (Math.random() - 0.5) * cell * 0.5)
      }),
    )
    return () => cancelAnimationFrame(id)
  }, [cell])

  return (
    <div className="b-reel" style={{ height: cell }}>
      <div
        className="b-reel__track"
        style={{
          transform: `translate3d(0, ${y}px, 0)`,
          transition: go ? `transform ${REEL_MS}ms cubic-bezier(0.12, 0.7, 0.15, 1)` : 'none',
        }}
      >
        {strip.map((g, i) => (
          <div key={i} className={`b-reel__cell rarity-${giftRarity(g)}`} style={{ height: cell }}>
            <GiftImg giftId={g} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Battle({ id }: { id: string }) {
  const { battles, join } = useBattles()
  const { cases, openSheet } = useStore()
  const { back } = useNav()
  const b = battles.find((x) => x.id === id)
  const [now, setNow] = useState(Date.now())
  const [closed, setClosed] = useState(false)
  const me = getMe()

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 150)
    return () => clearInterval(timer)
  }, [])

  const stageInfo = b ? battleStage(b, now) : null
  useEffect(() => {
    if (stageInfo?.stage === 'rolling') haptic.select()
    if (stageInfo?.stage === 'done') haptic.success()
  }, [stageInfo?.stage, stageInfo?.round])

  if (!b || !stageInfo) {
    return (
      <div className="screen">
        <PageHead title={t('Кейс-батл')} />
        <div className="empty">{t('Батл уже закончился')}</div>
      </div>
    )
  }

  const { stage, round } = stageInfo
  const list = b.caseIds.map((cid) => cases.find((c) => c.id === cid)!)
  const size = b.seats.length
  const cell = size >= 4 ? 64 : size === 3 ? 76 : 96
  const mine = b.seats.some((s) => s?.me)
  // Раунд, который уже показан полностью: во время прокрутки текущий ещё не раскрыт
  const revealed = stage === 'done' ? list.length : stage === 'rolling' && now - (b.startedAt! + COUNTDOWN_MS + round * ROUND_MS) > REEL_MS ? round + 1 : round
  const pot = b.seats.reduce((s, _, i) => s + seatTotal(b, i, revealed), 0)
  const countdown = Math.ceil((b.startedAt! + COUNTDOWN_MS - now) / 1000)
  const iWon = stage === 'done' && b.seats[b.winner!]?.me

  return (
    <div className="screen">
      <PageHead
        title={t('Кейс-батл')}
        right={
          <span className="muted small">
            {stage === 'waiting' ? t('ждёт игроков') : stage === 'done' ? t('завершён') : t('раунд {r} из {n}', { r: Math.min(round + 1, list.length), n: list.length })}
          </span>
        }
      />

      <div className="battle-cases">
        {list.map((c, i) => (
          <span
            key={i}
            className={`battle-cases__item ${stage === 'rolling' && i === round ? 'is-current' : ''} ${i < revealed ? 'is-done' : ''}`}
            style={{ '--accent': c.accent } as CSSProperties}
            title={caseName(c)}
          >
            <GiftImg giftId={c.cover} />
          </span>
        ))}
      </div>

      <div className="battle-pot">
        <span className="muted small">{t('Банк')}</span>
        <Money ton={pot} size={18} />
      </div>

      <div className="battle-arena" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {stage === 'countdown' && <div className="battle-countdown">{countdown}</div>}
        {b.seats.map((s, i) => {
          const total = seatTotal(b, i, revealed)
          const isWinner = stage === 'done' && b.winner === i
          return (
            <div key={i} className={`battle-col ${s?.me ? 'is-me' : ''} ${isWinner ? 'is-winner' : stage === 'done' ? 'is-loser' : ''}`}>
              <div className="battle-col__head">
                {s ? (
                  <>
                    {isWinner && <IconCrown size={16} className="battle-col__crown" />}
                    <Avatar name={s.name} color={s.color} size={34} photo={s.me ? me.photo : undefined} />
                    <span className="battle-col__name">{s.me ? t('Вы') : s.name}</span>
                  </>
                ) : (
                  <>
                    <span className="battle-col__empty">
                      <IconPlus size={16} />
                    </span>
                    {mine ? (
                      <span className="muted small">{t('Ждём игрока')}</span>
                    ) : (
                      <button
                        type="button"
                        className="link-btn small"
                        onClick={() => {
                          if (!join(b.id)) {
                            haptic.error()
                            openSheet('deposit')
                          }
                        }}
                      >
                        {t('Занять')}
                      </button>
                    )}
                  </>
                )}
              </div>

              {stage === 'rolling' && b.drops && revealed === round ? (
                <Reel key={round} c={list[round]} winGiftId={b.drops[round][i].giftId} cell={cell} />
              ) : (
                <div className="b-reel b-reel--idle" style={{ height: cell }}>
                  {b.drops && revealed > 0 ? <GiftImg giftId={b.drops[revealed - 1][i].giftId} num={b.drops[revealed - 1][i].num} /> : <GiftImg giftId={list[0].cover} />}
                </div>
              )}

              <Money ton={total} size={13} className="battle-col__total" />

              <div className="battle-col__drops">
                {b.drops?.slice(0, revealed).map((row, r) => (
                  <div key={r} className={`battle-drop rarity-${giftRarity(row[i].giftId)}`}>
                    <GiftImg giftId={row[i].giftId} num={row[i].num} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <FairLine
        hash={b.round.hash}
        verify={stage === 'done' ? { game: 'battle', seed: b.round.seed, params: { cases: b.caseIds.join(','), players: size } } : undefined}
      />

      <WinModal open={!!iWon && !closed} title={t('Вы забрали всё!')} amount={pot}>
        <button type="button" className="btn btn--ghost" onClick={() => setClosed(true)}>
          {t('Закрыть')}
        </button>
        <button type="button" className="btn btn--primary" onClick={back}>
          {t('К батлам')}
        </button>
      </WinModal>
    </div>
  )
}
