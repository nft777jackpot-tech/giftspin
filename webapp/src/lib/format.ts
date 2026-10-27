import { getLocale } from './i18n'

const cache = new Map<string, Intl.NumberFormat>()

function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `${getLocale()}|${key}`
  let f = cache.get(id)
  if (!f) {
    f = new Intl.NumberFormat(getLocale(), opts)
    cache.set(id, f)
  }
  return f
}

const digits = (d: number) => nf(`d${d}`, { maximumFractionDigits: d, minimumFractionDigits: 0 })

export function fmtAmount(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1000) return digits(0).format(n)
  if (abs >= 100) return digits(1).format(n)
  return digits(2).format(n)
}

export function fmtNum(n: number, d = 0): string {
  return digits(d).format(n)
}

export function fmtChance(p: number): string {
  const pct = p * 100
  if (pct >= 10) return `${digits(1).format(pct)}%`
  if (pct >= 1) return `${digits(2).format(pct)}%`
  return `${nf('sig2', { maximumSignificantDigits: 2 }).format(pct)}%`
}

export function fmtMult(m: number): string {
  return `x${m.toFixed(2)}`
}

export function fmtTime(at: number): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(at)
}

export function fmtDate(at: number): string {
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short' }).format(at)
}

/** Оставшееся время: «2 д 05:14:09» или «05:14:09». */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

export function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h
}
