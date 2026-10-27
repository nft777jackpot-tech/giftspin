import { IconCheck } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { LANGS, t, useLang } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

export function LangSheet() {
  const { sheet, openSheet } = useStore()
  const { lang, setLang } = useLang()
  return (
    <Sheet open={sheet === 'lang'} title={t('Язык')} onClose={() => openSheet(null)}>
      <div className="menu">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="menu-row"
            onClick={() => {
              haptic.select()
              setLang(l.id)
              openSheet(null)
            }}
          >
            <span className="menu-row__label">{l.name}</span>
            {lang === l.id && <IconCheck size={18} className="menu-row__check" />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
