import { createContext, Fragment, useContext, type ReactNode } from 'react'
import { en } from '../i18n/en'
import { es } from '../i18n/es'
import { pt } from '../i18n/pt'
import { ru } from '../i18n/ru'
import { tr } from '../i18n/tr'
import { tg } from './telegram'

export type Lang = 'ru' | 'en' | 'es' | 'pt' | 'tr'

export const LANGS: { id: Lang; name: string; locale: string }[] = [
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'pt', name: 'Português', locale: 'pt-BR' },
  { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
]

/** Перевод строки или формы множественного числа по правилам Intl.PluralRules. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>>
export type Dict = Record<string, string | Plural>

// Ключ — русский текст. В ru лежат только формы множественного числа
const DICTS: Record<Lang, Dict> = { ru, en, es, pt, tr }
const STORAGE_KEY = 'lang'

let current: Lang = 'ru'
const plurals = new Map<Lang, Intl.PluralRules>()

export const getLang = () => current
export const getLocale = () => LANGS.find((l) => l.id === current)!.locale

/** Вызывается из App при каждой отрисовке, до детей, поэтому t() везде видит свежий язык. */
export function setCurrentLang(lang: Lang) {
  current = lang
}

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v)

// Языки СНГ, где русский понятнее английского
const RU_FALLBACK = ['uk', 'be', 'kk', 'uz', 'ky', 'tg', 'az', 'hy', 'ka']

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // хранилище недоступно, берём язык Telegram
  }
  const code = (tg?.initDataUnsafe.user?.language_code ?? navigator.language ?? 'en').slice(0, 2).toLowerCase()
  if (isLang(code)) return code
  return RU_FALLBACK.includes(code) ? 'ru' : 'en'
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // не страшно: при следующем запуске язык определится заново
  }
}

type Vars = Record<string, string | number>

function lookup(key: string, n: number | undefined): string {
  const entry = DICTS[current][key] ?? DICTS.ru[key] ?? key
  if (typeof entry === 'string') return entry
  let rules = plurals.get(current)
  if (!rules) {
    rules = new Intl.PluralRules(getLocale())
    plurals.set(current, rules)
  }
  return entry[rules.select(n ?? 0)] ?? entry.other ?? key
}

/** t('Привет, {name}', { name }) — перевод с подстановкой. Число n выбирает форму множественного. */
export function t(key: string, vars?: Vars): string {
  const s = lookup(key, vars?.n === undefined ? undefined : Number(vars.n))
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** То же, что t, но подставляет React-элементы: tj('Открыть за {price}', { price: <Money … /> }). */
export function tj(key: string, vars: Record<string, ReactNode>, n?: number): ReactNode {
  const parts = lookup(key, n).split(/\{(\w+)\}/g)
  return parts.map((p, i) => <Fragment key={i}>{i % 2 ? (vars[p] ?? `{${p}}`) : p}</Fragment>)
}

/** Помечает строку в константе для сборщика ключей. Переводится через t() при отрисовке. */
export const tk = (key: string) => key

interface LangCtx {
  lang: Lang
  setLang(l: Lang): void
}

export const LangContext = createContext<LangCtx | null>(null)

export function useLang(): LangCtx {
  const c = useContext(LangContext)
  if (!c) throw new Error('useLang outside LangContext')
  return c
}
