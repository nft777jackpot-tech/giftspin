import { useMemo, useState } from 'react'
import { caseName } from '../components/CaseCard'
import { IconCopy } from '../components/icons'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { RTP } from '../config'
import { actualRtp, GAME_STATS } from '../data/stats'
import { CHAIN_TERMINAL, crashHistory } from '../lib/crashChain'
import { fmtChance, fmtMult, fmtNum, fmtTime, shortHash } from '../lib/format'
import { t, tk } from '../lib/i18n'
import { rouletteMultiplier, UPGRADE_MAX_CHANCE } from '../lib/rtp'
import { copyText, haptic } from '../lib/telegram'
import { GAME_NAMES, PERSONAL_GAMES, ROUND_GAMES, verifyRound, type GameId, type VerifyInput } from '../lib/verify'
import { useStore } from '../state/store'

type Tab = 'seeds' | 'verify' | 'crash' | 'rtp'

function Copyable({ text, short }: { text: string; short?: boolean }) {
  return (
    <button
      type="button"
      className="copyable mono"
      onClick={() => {
        copyText(text)
        haptic.success()
        toast(t('Скопировано'), 'success')
      }}
    >
      <span>{short ? shortHash(text) : text}</span>
      <IconCopy size={13} />
    </button>
  )
}

const FORMULA: Record<GameId, string> = {
  case: tk('Средняя стоимость выпадения = {rtp}% цены кейса'),
  battle: tk('Те же кейсы: {rtp}% стоимости участия'),
  upgrade: tk('Шанс = {rtp}% × ставка ÷ цена цели, не больше {max}%'),
  crash: tk('Вероятность дожить до xM = {rtp}% ÷ M'),
  mines: tk('Множитель = {rtp}% ÷ вероятность пройти клетки'),
  plinko: tk('Множители лунок масштабированы под {rtp}%'),
  roulette: tk('Красное и чёрное {red}, зелёное {green}'),
  dice: tk('Множитель = {rtp}% ÷ шанс'),
  coinflip: tk('Победитель получает {rtp}% банка'),
  contract: tk('Средняя стоимость результата = {rtp}% сданных подарков'),
  jackpot: tk('Комиссия {fee}% с банка'),
}

export function Fair({ preset }: { preset?: VerifyInput }) {
  const { seeds, revealed, rotateSeeds, rounds, cases } = useStore()
  const [tab, setTab] = useState<Tab>(preset ? 'verify' : 'seeds')
  const [clientSeed, setClientSeed] = useState(seeds.clientSeed)
  const [input, setInput] = useState<VerifyInput>(preset ?? { game: 'dice' })
  const rtp = Math.round(RTP * 100)
  const personal = PERSONAL_GAMES.includes(input.game)

  const result = useMemo(() => verifyRound(input, cases), [input, cases])
  const set = (patch: Partial<VerifyInput>) => setInput((v) => ({ ...v, ...patch }))
  const param = (k: string, v: string | number) => setInput((x) => ({ ...x, params: { ...x.params, [k]: v } }))
  const p = input.params ?? {}

  const verifyFrom = (v: VerifyInput) => {
    setInput(v)
    setTab('verify')
    window.scrollTo(0, 0)
  }

  return (
    <div className="screen">
      <PageHead title={t('Честная игра')} />

      <div className="seg seg--tabs">
        {(
          [
            ['seeds', t('Сиды')],
            ['verify', t('Проверка')],
            ['crash', t('Краш')],
            ['rtp', 'RTP'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'seeds' && (
        <>
          <div className="panel fair">
            <p>
              {t('Исход каждой игры считается из трёх значений: серверного сида, вашего сида и номера ставки. Хеш серверного сида показан заранее, поэтому мы не можем подменить результат после ставки. При смене пары старый сид раскрывается, и любую прошлую игру можно пересчитать.')}
            </p>
            <label className="field">
              <span>{t('Хеш серверного сида (SHA-256)')}</span>
              <Copyable text={seeds.hash} />
            </label>
            <label className="field">
              <span>{t('Ваш сид')}</span>
              <input className="input mono" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} />
            </label>
            <div className="kv">
              <span>{t('Номер следующей ставки')}</span>
              <b>{seeds.nonce}</b>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                rotateSeeds(clientSeed)
                haptic.success()
                toast(t('Сиды обновлены, предыдущий серверный сид раскрыт'), 'success')
              }}
            >
              {t('Сменить сиды')}
            </button>
          </div>

          <div className="section-title">{t('Мои последние игры')}</div>
          {rounds.length ? (
            <div className="panel tx-list">
              {rounds.slice(0, 30).map((r) => {
                const server = revealed[r.hash]
                return (
                  <div key={r.id} className="tx">
                    <div>
                      <div className="tx__title">{r.title}</div>
                      <div className="muted small">
                        {t('ставка №{n}', { n: r.nonce })} · {fmtTime(r.at)} · {r.result}
                      </div>
                    </div>
                    {server ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => verifyFrom({ game: r.game, serverSeed: server, clientSeed: r.clientSeed, nonce: r.nonce, params: r.params })}
                      >
                        {t('Проверить')}
                      </button>
                    ) : (
                      <span className="muted small fair-wait">{t('после смены сидов')}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty">{t('Сыграйте в кейсы, апгрейд, мины, плинко, дайс или контракты — игры появятся здесь')}</div>
          )}

          {Object.keys(revealed).length > 0 && (
            <>
              <div className="section-title">{t('Раскрытые сиды')}</div>
              <div className="panel tx-list">
                {Object.entries(revealed).map(([hash, seed]) => (
                  <div key={hash} className="fair-pair">
                    <span className="muted small">{t('Хеш')}</span>
                    <Copyable text={hash} short />
                    <span className="muted small">{t('Сид')}</span>
                    <Copyable text={seed} short />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'verify' && (
        <div className="panel fair">
          <div className="chips-row chips-row--wrap">
            {[...PERSONAL_GAMES, ...ROUND_GAMES].map((g) => (
              <button key={g} type="button" className={`chip ${input.game === g ? 'is-active' : ''}`} onClick={() => setInput({ game: g })}>
                {t(GAME_NAMES[g])}
              </button>
            ))}
          </div>

          {personal ? (
            <>
              <label className="field">
                <span>{t('Серверный сид (раскрытый)')}</span>
                <input className="input mono" value={input.serverSeed ?? ''} onChange={(e) => set({ serverSeed: e.target.value })} spellCheck={false} />
              </label>
              <div className="row-2">
                <label className="field">
                  <span>{t('Ваш сид')}</span>
                  <input className="input mono" value={input.clientSeed ?? ''} onChange={(e) => set({ clientSeed: e.target.value })} spellCheck={false} />
                </label>
                <label className="field">
                  <span>{t('Номер ставки')}</span>
                  <input className="input mono" inputMode="numeric" value={input.nonce ?? 0} onChange={(e) => set({ nonce: Number(e.target.value) || 0 })} />
                </label>
              </div>
            </>
          ) : (
            <label className="field">
              <span>{t('Сид раунда')}</span>
              <input className="input mono" value={input.seed ?? ''} onChange={(e) => set({ seed: e.target.value })} spellCheck={false} />
            </label>
          )}

          {input.game === 'case' && (
            <label className="field">
              <span>{t('Кейс')}</span>
              <select className="input" value={String(p.caseId ?? '')} onChange={(e) => param('caseId', e.target.value)}>
                <option value="">—</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {caseName(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(input.game === 'upgrade' || input.game === 'dice') && (
            <label className="field">
              <span>{t('Шанс, %')}</span>
              <input
                className="input mono"
                inputMode="decimal"
                value={p.chance !== undefined ? +(Number(p.chance) * 100).toFixed(4) : ''}
                onChange={(e) => param('chance', (parseFloat(e.target.value.replace(',', '.')) || 0) / 100)}
              />
            </label>
          )}
          {input.game === 'dice' && (
            <div className="seg">
              <button type="button" className={Number(p.over) !== 1 ? 'is-active' : ''} onClick={() => param('over', 0)}>
                {t('Меньше')}
              </button>
              <button type="button" className={Number(p.over) === 1 ? 'is-active' : ''} onClick={() => param('over', 1)}>
                {t('Больше')}
              </button>
            </div>
          )}
          {input.game === 'mines' && (
            <label className="field">
              <span>{t('Мин на поле')}</span>
              <input className="input mono" inputMode="numeric" value={p.mines ?? 3} onChange={(e) => param('mines', Number(e.target.value) || 1)} />
            </label>
          )}
          {input.game === 'plinko' && (
            <div className="row-2">
              <label className="field">
                <span>{t('Рядов')}</span>
                <select className="input" value={String(p.rows ?? 12)} onChange={(e) => param('rows', Number(e.target.value))}>
                  {[8, 12, 16].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('Риск')}</span>
                <select className="input" value={String(p.risk ?? 'mid')} onChange={(e) => param('risk', e.target.value)}>
                  <option value="low">{t('Низкий')}</option>
                  <option value="mid">{t('Средний')}</option>
                  <option value="high">{t('Высокий')}</option>
                </select>
              </label>
            </div>
          )}
          {input.game === 'contract' && (
            <label className="field">
              <span>{t('Сумма сданных подарков, TON')}</span>
              <input className="input mono" inputMode="decimal" value={p.total ?? ''} onChange={(e) => param('total', parseFloat(e.target.value.replace(',', '.')) || 0)} />
            </label>
          )}
          {input.game === 'battle' && (
            <div className="row-2">
              <label className="field">
                <span>{t('Кейсы через запятую')}</span>
                <input className="input mono" value={p.cases ?? ''} onChange={(e) => param('cases', e.target.value)} placeholder="starter,witch" />
              </label>
              <label className="field">
                <span>{t('Игроков')}</span>
                <input className="input mono" inputMode="numeric" value={p.players ?? 2} onChange={(e) => param('players', Number(e.target.value) || 2)} />
              </label>
            </div>
          )}
          {input.game === 'jackpot' && (
            <label className="field">
              <span>{t('Вклады участников по порядку, через запятую')}</span>
              <input className="input mono" value={p.weights ?? ''} onChange={(e) => param('weights', e.target.value)} placeholder="1.5,4,0.8" />
            </label>
          )}

          {typeof result === 'string' ? (
            <div className="muted small">{result}</div>
          ) : (
            <div className="verify-out">
              <div className="verify-out__row">
                <span>{personal ? t('SHA-256 серверного сида') : t('SHA-256 сида раунда')}</span>
                <code className="mono">{result.hash}</code>
              </div>
              {result.lines.map(([k, v]) => (
                <div key={k} className="verify-out__row">
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          )}
          <p className="note">{t('Хеш должен совпасть с тем, что игра показала до ставки. Код проверки открыт: те же формулы использует сервер.')}</p>
        </div>
      )}

      {tab === 'crash' && (
        <>
          <div className="panel fair">
            <p>{t('Сид каждого раунда — SHA-256 сида следующего раунда. Цепочка создана заранее, её последнее звено опубликовано до первой игры, поэтому будущие раунды подменить нельзя.')}</p>
            <label className="field">
              <span>{t('Опубликованный конец цепочки')}</span>
              <Copyable text={CHAIN_TERMINAL} />
            </label>
          </div>
          <div className="panel tx-list">
            {crashHistory().slice(0, 50).map((r) => (
              <div key={r.id} className="tx">
                <div>
                  <div className="tx__title">
                    #{r.id} <span className={`hist-chip hist-chip--${r.point >= 10 ? 'gold' : r.point >= 2 ? 'blue' : 'grey'}`}>{fmtMult(r.point)}</span>
                  </div>
                  <div className="muted small mono">
                    {shortHash(r.seed)} · {fmtTime(r.at)}
                  </div>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => verifyFrom({ game: 'crash', seed: r.seed })}>
                  {t('Проверить')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'rtp' && (
        <>
          <div className="panel rtp-table">
            <div className="rtp-row rtp-row--head">
              <span>{t('Игра')}</span>
              <span>{t('Теория')}</span>
              <span>{t('Факт, 30 дней')}</span>
            </div>
            {GAME_STATS.map((s) => {
              const fact = actualRtp(s)
              return (
                <div key={s.game} className="rtp-row rtp-row--grid">
                  <div>
                    <b>{t(GAME_NAMES[s.game])}</b>
                    <span>
                      {t(FORMULA[s.game], {
                        rtp,
                        max: Math.round(UPGRADE_MAX_CHANCE * 100),
                        red: fmtMult(rouletteMultiplier('red')),
                        green: fmtMult(rouletteMultiplier('green')),
                        fee: 100 - rtp,
                      })}
                    </span>
                    <span className="muted small">{t('{n} ставок', { n: fmtNum(s.bets) })}</span>
                  </div>
                  <span className="rtp-num">{rtp}%</span>
                  <span className={`rtp-num ${fact > RTP ? 'pos' : ''}`}>{fmtChance(fact)}</span>
                </div>
              )
            })}
          </div>
          <p className="note">{t('Фактический RTP — сколько игрокам реально вернулось от всех ставок за 30 дней. Обновляется каждый час. Колебания вокруг теории — обычная случайность.')}</p>
        </>
      )}
    </div>
  )
}
