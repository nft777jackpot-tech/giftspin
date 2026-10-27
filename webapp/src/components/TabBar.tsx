import { t, tk } from '../lib/i18n'
import { haptic } from '../lib/telegram'
import { useNav, type Tab } from '../state/nav'
import { IconBag, IconBox, IconGames, IconUpgrade, IconUser } from './icons'

const TABS: { id: Tab; label: string; Icon: typeof IconGames }[] = [
  { id: 'games', label: tk('Игры'), Icon: IconGames },
  { id: 'cases', label: tk('Кейсы'), Icon: IconBox },
  { id: 'upgrade', label: tk('Апгрейд'), Icon: IconUpgrade },
  { id: 'inventory', label: tk('Инвентарь'), Icon: IconBag },
  { id: 'profile', label: tk('Профиль'), Icon: IconUser },
]

export function TabBar() {
  const { tab, page, setTab } = useNav()
  return (
    <nav className="tabbar" aria-label={t('Разделы')}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id && !page
        return (
          <button
            key={id}
            type="button"
            className={`tabbar__item ${tab === id ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              haptic.select()
              setTab(id)
            }}
          >
            <Icon size={22} />
            <span>{t(label)}</span>
          </button>
        )
      })}
    </nav>
  )
}
