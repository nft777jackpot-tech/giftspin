import type { CSSProperties } from 'react'
import { IconCheck } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { BG_THEMES, bgBase, bgColors, CUSTOM_ID, tame, toneColors, useBackground, type BgTone } from '../lib/background'
import { t, tk } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

/** Превью фона: те же три пятна на основе, что рисует WebGL. */
function swatch(colors: string[]): CSSProperties {
  return {
    background: `radial-gradient(circle at 28% 30%, ${colors[0]}, transparent 62%), radial-gradient(circle at 76% 68%, ${colors[1]}, transparent 60%), linear-gradient(135deg, ${colors[2]}, ${colors[3]})`,
  }
}

const TONES: { id: BgTone; label: string }[] = [
  { id: 'dark', label: tk('Тёмный') },
  { id: 'light', label: tk('Светлый') },
]

export function BackgroundSheet() {
  const { sheet, openSheet } = useStore()
  const { bg, setBg } = useBackground()
  const isCustom = bg.id === CUSTOM_ID

  const setCustomColor = (i: number, hex: string) => {
    const custom = [...bg.custom]
    custom[i] = tame(hex)
    setBg({ ...bg, id: CUSTOM_ID, custom })
  }

  return (
    <Sheet open={sheet === 'bg'} title={t('Фон')} onClose={() => openSheet(null)}>
      <div className="seg" role="radiogroup" aria-label={t('Основа фона')}>
        {TONES.map((tone) => (
          <button
            key={tone.id}
            type="button"
            role="radio"
            aria-checked={bg.tone === tone.id}
            className={bg.tone === tone.id ? 'is-active' : ''}
            onClick={() => {
              haptic.select()
              setBg({ ...bg, tone: tone.id })
            }}
          >
            <span className={`tone-dot tone-dot--${tone.id}`} style={{ background: bgBase(tone.id) }} />
            {t(tone.label)}
          </button>
        ))}
      </div>

      <div className="bg-grid">
        {BG_THEMES.map((th) => (
          <button
            key={th.id}
            type="button"
            className={`bg-option ${bg.id === th.id ? 'is-active' : ''}`}
            onClick={() => {
              haptic.select()
              setBg({ ...bg, id: th.id })
            }}
            aria-pressed={bg.id === th.id}
          >
            <span className="bg-option__swatch" style={swatch(toneColors(th.colors, bg.tone))}>
              {bg.id === th.id && <IconCheck size={18} />}
            </span>
            <span className="bg-option__name">{t(th.name)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`bg-option ${isCustom ? 'is-active' : ''}`}
          onClick={() => {
            haptic.select()
            setBg({ ...bg, id: CUSTOM_ID })
          }}
          aria-pressed={isCustom}
        >
          <span className="bg-option__swatch" style={swatch(bgColors({ ...bg, id: CUSTOM_ID }))}>
            {isCustom && <IconCheck size={18} />}
          </span>
          <span className="bg-option__name">{t('Свой')}</span>
        </button>
      </div>

      <button
        type="button"
        className="bg-toggle"
        onClick={() => {
          haptic.select()
          setBg({ ...bg, floating: !bg.floating })
        }}
        aria-pressed={bg.floating}
      >
        <span className="bg-toggle__text">
          <b>{t('Летающие NFT')}</b>
          <span className="muted small">{t('Подарки медленно плывут за интерфейсом')}</span>
        </span>
        <span className={`toggle ${bg.floating ? 'is-on' : ''}`}>
          <span className="toggle__dot" />
        </span>
      </button>

      <div className="section-title section-title--sm">{t('Свои цвета')}</div>
      <div className="bg-custom">
        {bg.custom.map((c, i) => (
          <label key={i} className="bg-custom__color">
            <input type="color" value={c} onChange={(e) => setCustomColor(i, e.target.value)} aria-label={t('Цвет {n}', { n: i + 1 })} />
            <span style={{ background: c }} />
            <code className="mono">{c}</code>
          </label>
        ))}
      </div>
      <p className="note">{t('Слишком светлые цвета немного притемняются, чтобы текст поверх фона читался. Выбор сохраняется на этом устройстве.')}</p>
    </Sheet>
  )
}
