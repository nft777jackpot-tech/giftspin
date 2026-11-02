// Живой канал с сервером: онлайн по разделам, лента выигрышей и снимки общих раундов (краш).
// Одно соединение на вкладку, при обрыве переподключается и сразу получает текущее состояние.
// Без сервера (демо, GitHub Pages) не подключается вовсе.
import { useEffect, useSyncExternalStore } from 'react'
import { API_URL, devUser } from './api'
import { tg } from './telegram'

export interface FeedItem {
  id: number
  name: string
  photo: string | null
  game: string
  amount: string
  gift?: { slug: string; num: number; name: string }
  prize?: string
  at: number
}

interface LiveState {
  connected: boolean
  /** id игрока по мнению сервера: по нему отмечаются свои ставки в общих раундах. */
  me: number | null
  total: number
  rooms: Record<string, number>
  feed: FeedItem[]
}

type Listener = (msg: Record<string, unknown>) => void

const FEED_KEEP = 30
let state: LiveState = { connected: false, me: null, total: 0, rooms: {}, feed: [] }
const watchers = new Set<() => void>()
const listeners = new Map<string, Set<Listener>>()
/** Разница часов сервера и устройства: таймер раунда у всех считается по часам сервера. */
let offset = 0
let bestRtt = Infinity

let ws: WebSocket | null = null
let room: string | null = null
let retry = 0
let pingTimer = 0

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch }
  watchers.forEach((w) => w())
}

function liveUrl(): string | null {
  if (!API_URL) return null
  const base = API_URL.startsWith('http') ? API_URL : `${location.origin}${API_URL}`
  return base.replace(/^http/, 'ws') + '/live'
}

function sendMsg(msg: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function syncClock(serverNow: number, rtt: number) {
  // Берём замер с самой быстрой доставкой: у него меньше всего ошибка
  if (rtt > bestRtt * 1.5 + 20) return
  bestRtt = Math.min(bestRtt, rtt)
  offset = serverNow + rtt / 2 - Date.now()
}

function connect() {
  const url = liveUrl()
  if (!url || ws) return
  const sock = new WebSocket(url)
  ws = sock
  sock.onopen = () => {
    retry = 0
    set({ connected: true })
    sendMsg({ t: 'auth', auth: tg?.initData ?? null, dev: tg?.initData ? undefined : devUser() })
    sendMsg({ t: 'join', room })
    const ping = () => sendMsg({ t: 'ping', ping: Date.now() })
    ping()
    window.clearInterval(pingTimer)
    pingTimer = window.setInterval(ping, 10_000)
  }
  sock.onmessage = (e) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(e.data))
    } catch {
      return
    }
    switch (msg.t) {
      case 'hello':
        // Грубая сверка до первого замера ping: задержку доставки пока не знаем
        if (bestRtt === Infinity) offset = Number(msg.now) - Date.now()
        set({ total: Number(msg.total) || 0, rooms: (msg.rooms as Record<string, number>) ?? {}, feed: (msg.feed as FeedItem[]) ?? [] })
        break
      case 'pong':
        syncClock(Number(msg.now), Date.now() - Number(msg.ping))
        break
      case 'me':
        set({ me: (msg.id as number | null) ?? null })
        break
      case 'online':
        set({ total: Number(msg.total) || 0, rooms: (msg.rooms as Record<string, number>) ?? {} })
        break
      case 'feed':
        set({ feed: [msg.item as FeedItem, ...state.feed].slice(0, FEED_KEEP) })
        break
    }
    listeners.get(String(msg.t))?.forEach((l) => l(msg))
  }
  sock.onclose = () => {
    ws = null
    window.clearInterval(pingTimer)
    set({ connected: false })
    // Переподключение с нарастающей паузой: 1, 2, 4… до 30 секунд
    const delay = Math.min(30_000, 1000 * 2 ** retry++)
    window.setTimeout(connect, delay)
  }
  sock.onerror = () => sock.close()
}

/** Время по часам сервера. */
export const serverNow = () => Date.now() + offset

/** Подписка на сообщения одного типа, например снимки краша. */
export function onLive(type: string, fn: Listener): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type)!.add(fn)
  return () => listeners.get(type)!.delete(fn)
}

/** Сообщить серверу, какой раздел открыт: от этого зависят онлайн и снимки раундов. */
export function joinRoom(next: string | null) {
  if (room === next) return
  room = next
  sendMsg({ t: 'join', room })
}

/** Повторно войти в текущий раздел: сервер пришлёт свежий снимок раунда. */
export function rejoinRoom() {
  sendMsg({ t: 'join', room })
}

export function startLive() {
  connect()
}

function subscribe(cb: () => void) {
  watchers.add(cb)
  return () => watchers.delete(cb)
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state)
}

/** Открытый раздел для подсчёта онлайна. */
export function useLiveRoom(name: string | null) {
  useEffect(() => {
    joinRoom(name)
  }, [name])
}
