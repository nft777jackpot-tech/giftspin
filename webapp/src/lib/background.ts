import { createContext, useContext } from 'react'
import { tk } from './i18n'

/** Четыре цвета анимированного фона: три пятна и самый тёмный тон по краям. */
export interface BgTheme {
  id: string
  name: string
  colors: string[]
}

// Тона тёмные, чтобы светлый текст поверх фона читался
export const BG_THEMES: BgTheme[] = [
  { id: 'ocean', name: tk('Океан'), colors: ['#0f3a6e', '#2a1f6b', '#0a2a55', '#000000'] },
  { id: 'amethyst', name: tk('Аметист'), colors: ['#3b1f6e', '#5a1f6b', '#1e1550', '#000000'] },
  { id: 'emerald', name: tk('Изумруд'), colors: ['#0d4a3a', '#0f3a4a', '#0a2e24', '#000000'] },
  { id: 'sunset', name: tk('Закат'), colors: ['#6a2a12', '#5a1a3a', '#3a1208', '#000000'] },
  { id: 'rose', name: tk('Роза'), colors: ['#5e1a42', '#3a1a5e', '#3d0f2a', '#000000'] },
  { id: 'gold', name: tk('Золото'), colors: ['#5a4310', '#4a2a0e', '#2e220a', '#000000'] },
  { id: 'graphite', name: tk('Графит'), colors: ['#2a2f3a', '#1c2230', '#151820', '#000000'] },
]

export const CUSTOM_ID = 'custom'

export interface BgState {
  id: string
  /** Три своих цвета, четвёртый всегда чёрный. */
  custom: string[]
  /** Летающие NFT-подарки за интерфейсом. */
  floating: boolean
  /** Основа фона: чёрная или белая. От неё зависит и тема интерфейса. */
  tone: BgTone
}

export type BgTone = 'dark' | 'light'

const STORAGE_KEY = 'bg'
const DEFAULT: BgState = { id: 'ocean', custom: BG_THEMES[0].colors.slice(0, 3), floating: false, tone: 'dark' }
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function loadBg(): BgState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    const known = raw?.id === CUSTOM_ID || BG_THEMES.some((th) => th.id === raw?.id)
    if (known && Array.isArray(raw.custom) && raw.custom.length === 3 && raw.custom.every(isHex)) {
      return { id: raw.id, custom: raw.custom, floating: raw.floating === true, tone: raw.tone === 'light' ? 'light' : 'dark' }
    }
  } catch {
    // хранилище недоступно или испорчено — берём фон по умолчанию
  }
  return DEFAULT
}

export function saveBg(state: BgState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // не страшно: фон просто не запомнится до следующего запуска
  }
}

/** Основа фона: в неё уходят края и промежутки между пятнами. */
export const bgBase = (tone: BgTone) => (tone === 'light' ? '#ffffff' : '#000000')

function mixWhite(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('')}`
}

/** Цвета пятен под тон: на белой основе тёмные тона становятся пастельными. */
export function toneColors(colors: string[], tone: BgTone): string[] {
  if (tone === 'dark') return [...colors.slice(0, 3), bgBase(tone)]
  return [...colors.slice(0, 3).map((c) => mixWhite(c, 0.55)), bgBase(tone)]
}

export function bgColors(state: BgState): string[] {
  const base = state.id === CUSTOM_ID ? state.custom : (BG_THEMES.find((th) => th.id === state.id) ?? BG_THEMES[0]).colors
  return toneColors(base, state.tone)
}

/** Притемняет слишком светлый цвет: светлота в HSL не выше 34%, иначе текст поверх фона не читается. */
export function tame(hex: string, maxLight = 0.34): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l <= maxLight) return hex.toLowerCase()
  // Масштабируем каналы к нужной светлоте, оттенок и насыщенность сохраняются
  const k = maxLight / l
  return `#${[r, g, b].map((v) => Math.round(v * k * 255).toString(16).padStart(2, '0')).join('')}`
}

interface BgCtx {
  bg: BgState
  setBg(state: BgState): void
}

export const BgContext = createContext<BgCtx | null>(null)

export function useBackground(): BgCtx {
  const c = useContext(BgContext)
  if (!c) throw new Error('useBackground outside BgContext')
  return c
}
