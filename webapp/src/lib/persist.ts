// Сохранение демо-игры: без сервера баланс, подарки и история живут на устройстве игрока.
// Пишем в localStorage (быстро, сразу при запуске) и в облако Telegram (CloudStorage): оно привязано
// к аккаунту, поэтому прогресс не пропадает, даже если Telegram очистит данные сайта или игрок
// зайдёт с другого устройства. При запуске берём более свежий из двух снимков.
import type { FeedItem } from './live'
import type { InvItem, PlayRound, Stats, Tx } from '../state/store'
import { tg } from './telegram'

export interface DemoSnapshot {
  v: 1
  savedAt: number
  balance: number
  inventory: InvItem[]
  history: Tx[]
  stats: Stats
  tasksDone: Record<string, number>
  promo: string | null
  refClaimed: number
  seeds: { serverSeed: string; hash: string; clientSeed: string; nonce: number }
  revealed: Record<string, string>
  rounds: PlayRound[]
  drops: FeedItem[]
}

/** Свой снимок у каждого аккаунта Telegram: на одном телефоне их может быть несколько. */
const KEY = `giftspin:demo:v1:${tg?.initDataUnsafe.user?.id ?? 'guest'}`
const CLOUD_PREFIX = 'demo'
/** Предел значения в CloudStorage — 4096 символов, длинный снимок режем на части. */
const CHUNK = 4000
const MAX_CHUNKS = 60

const valid = (s: unknown): s is DemoSnapshot =>
  !!s && typeof s === 'object' && (s as DemoSnapshot).v === 1 && typeof (s as DemoSnapshot).balance === 'number' && Array.isArray((s as DemoSnapshot).inventory)

export function loadLocal(): DemoSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return valid(s) ? s : null
  } catch {
    return null
  }
}

export function saveLocal(s: DemoSnapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // нет места или хранилище закрыто — останется копия в облаке Telegram
  }
}

interface Cloud {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void
  removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void): void
}

const cloud = (): Cloud | null => {
  const c = (tg as unknown as { CloudStorage?: Cloud } | undefined)?.CloudStorage
  return c && tg!.isVersionAtLeast('6.9') ? c : null
}

const getItems = (c: Cloud, keys: string[]) =>
  new Promise<Record<string, string>>((res) => c.getItems(keys, (err, values) => res(err || !values ? {} : values)))

export async function loadCloud(): Promise<DemoSnapshot | null> {
  const c = cloud()
  if (!c) return null
  const head = await getItems(c, [`${CLOUD_PREFIX}_n`])
  const n = Number(head[`${CLOUD_PREFIX}_n`])
  if (!n || n > MAX_CHUNKS) return null
  const parts = await getItems(c, Array.from({ length: n }, (_, i) => `${CLOUD_PREFIX}${i}`))
  try {
    const s = JSON.parse(Array.from({ length: n }, (_, i) => parts[`${CLOUD_PREFIX}${i}`] ?? '').join(''))
    return valid(s) ? s : null
  } catch {
    return null
  }
}

let cloudTimer = 0
let lastCloudChunks = 0

/** Запись в облако не чаще раза в несколько секунд: у Telegram ограничение на частоту запросов. */
export function saveCloud(s: DemoSnapshot) {
  const c = cloud()
  if (!c) return
  window.clearTimeout(cloudTimer)
  cloudTimer = window.setTimeout(() => {
    const text = JSON.stringify(s)
    const chunks = Math.ceil(text.length / CHUNK)
    if (chunks > MAX_CHUNKS) return
    for (let i = 0; i < chunks; i++) c.setItem(`${CLOUD_PREFIX}${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK))
    // Число частей пишем последним: пока оно старое, читается целый прошлый снимок
    c.setItem(`${CLOUD_PREFIX}_n`, String(chunks))
    if (lastCloudChunks > chunks) c.removeItems(Array.from({ length: lastCloudChunks - chunks }, (_, i) => `${CLOUD_PREFIX}${chunks + i}`))
    lastCloudChunks = chunks
  }, 3000)
}
