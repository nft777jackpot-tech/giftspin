import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { VerifyInput } from '../lib/verify'

export type Tab = 'games' | 'cases' | 'upgrade' | 'inventory' | 'profile'

export type Page =
  | { name: 'crash' }
  | { name: 'roulette' }
  | { name: 'jackpot' }
  | { name: 'case'; id: string }
  | { name: 'battles' }
  | { name: 'battle'; id: string }
  | { name: 'coinflip' }
  | { name: 'contracts' }
  | { name: 'mines' }
  | { name: 'plinko' }
  | { name: 'dice' }
  | { name: 'fair'; verify?: VerifyInput }
  | { name: 'history' }
  | { name: 'tasks' }
  | { name: 'tournament' }
  | { name: 'referrals' }
  | { name: 'admin' }

interface Nav {
  tab: Tab
  page: Page | null
  setTab(t: Tab): void
  /** Открывает страницу поверх текущей, «Назад» вернёт на предыдущую. */
  open(p: Page): void
  /** Заменяет текущую страницу, не добавляя шаг в историю. */
  replace(p: Page): void
  back(): void
}

const Ctx = createContext<Nav | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('games')
  const [stack, setStack] = useState<Page[]>([])

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    setStack([])
  }, [])
  const open = useCallback((p: Page) => setStack((s) => [...s, p]), [])
  const replace = useCallback((p: Page) => setStack((s) => [...s.slice(0, -1), p]), [])
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), [])

  const page = stack.length ? stack[stack.length - 1] : null
  const value = useMemo(() => ({ tab, page, setTab, open, replace, back }), [tab, page, setTab, open, replace, back])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNav(): Nav {
  const n = useContext(Ctx)
  if (!n) throw new Error('useNav outside NavProvider')
  return n
}
