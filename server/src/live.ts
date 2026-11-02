// Живой канал: один WebSocket на игрока. Сервер рассылает снимки общих раундов, онлайн по разделам
// и ленту выигрышей. Ставки и выводы идут обычными запросами /api/... с проверкой входа, а сюда
// приходит уже подтверждённый сервером результат, поэтому у всех игроков одна и та же картина.
import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { authFrom, type AuthUser } from './auth.ts'
import { q } from './db.ts'

interface Client {
  socket: WebSocket
  user: AuthUser | null
  /** Раздел, который игрок сейчас смотрит: crash, roulette, cases и так далее. */
  room: string | null
  /** Ключ для подсчёта онлайна: один игрок в двух вкладках считается один раз. */
  key: string
}

const clients = new Set<Client>()
let connSeq = 0

const ROOM_RE = /^[a-z]{2,20}$/
const ONLINE_EVERY_MS = 2000

/** Снимок раздела для только что вошедшего игрока: текущий раунд целиком. */
type Snapshot = (user: AuthUser | null) => unknown
const snapshots = new Map<string, Snapshot>()

/** Игра регистрирует свой снимок: его получает каждый, кто входит в раздел или переподключается. */
export function onJoin(room: string, snapshot: Snapshot) {
  snapshots.set(room, snapshot)
}

function send(c: Client, msg: unknown) {
  if (c.socket.readyState === c.socket.OPEN) c.socket.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

/** Сообщение всем подключённым или только тем, кто в разделе room. */
export function broadcast(msg: unknown, room?: string) {
  const text = JSON.stringify(msg)
  for (const c of clients) if (!room || c.room === room) send(c, text)
}

/** Личное сообщение игроку во все его вкладки. */
export function sendTo(userId: number, msg: unknown) {
  const text = JSON.stringify(msg)
  for (const c of clients) if (c.user?.id === userId) send(c, text)
}

// ---------- Онлайн ----------

export function onlineCounts(): { total: number; rooms: Record<string, number> } {
  const all = new Set<string>()
  const byRoom = new Map<string, Set<string>>()
  for (const c of clients) {
    all.add(c.key)
    if (!c.room) continue
    if (!byRoom.has(c.room)) byRoom.set(c.room, new Set())
    byRoom.get(c.room)!.add(c.key)
  }
  return { total: all.size, rooms: Object.fromEntries([...byRoom].map(([r, s]) => [r, s.size])) }
}

let onlineDirty = false
let lastOnline = ''
setInterval(() => {
  if (!onlineDirty) return
  onlineDirty = false
  const msg = JSON.stringify({ t: 'online', ...onlineCounts() })
  if (msg === lastOnline) return
  lastOnline = msg
  for (const c of clients) send(c, msg)
}, ONLINE_EVERY_MS).unref()

// ---------- Лента выигрышей ----------

export interface FeedItem {
  id: number
  name: string
  photo: string | null
  game: string
  /** Выигрыш в TON строкой. */
  amount: string
  /** Выигранный подарок: коллекция и номер экземпляра. */
  gift?: { slug: string; num: number; name: string }
  /** Монета или ничего (кейс «Бомж»): id приза, как на сайте. */
  prize?: string
  at: number
}

const FEED_KEEP = 30
const feed: FeedItem[] = []
let feedSeq = 0

/** Записывает выигрыш в общую ленту и сразу рассылает его всем. */
export function publishWin(user: { name: string; photo?: string | null }, item: Omit<FeedItem, 'id' | 'name' | 'photo' | 'at'>) {
  const full: FeedItem = { id: ++feedSeq, name: user.name, photo: user.photo ?? null, at: Date.now(), ...item }
  feed.unshift(full)
  if (feed.length > FEED_KEEP) feed.pop()
  broadcast({ t: 'feed', item: full })
}

/** Выигрыш игрока по его id: имя берётся из базы, аватар — с последнего входа. */
export function publishUserWin(userId: number, item: Omit<FeedItem, 'id' | 'name' | 'photo' | 'at'>) {
  const row = q('SELECT name FROM users WHERE id = ?').get(userId)
  publishWin({ name: row ? String(row.name) : `id${userId}`, photo: photoOf(userId) }, item)
}

/** Аватар игрока с последнего входа: в базе он не хранится. */
const photos = new Map<number, string | null>()
export const photoOf = (userId: number) => photos.get(userId) ?? null
export function rememberPhoto(user: AuthUser) {
  photos.set(user.id, user.photo)
}

// ---------- Подключение ----------

export async function registerLive(app: FastifyInstance) {
  await app.register(websocket, { options: { maxPayload: 4096 } })

  app.get('/api/live', { websocket: true }, (socket) => {
    const client: Client = { socket, user: null, room: null, key: `c${++connSeq}` }
    clients.add(client)
    onlineDirty = true
    // Сразу после входа: время сервера, онлайн и последние выигрыши. Снимок раздела — после join
    send(client, { t: 'hello', now: Date.now(), me: null, ...onlineCounts(), feed })

    const enter = (room: string | null) => {
      client.room = room
      onlineDirty = true
      const snap = room ? snapshots.get(room) : undefined
      if (snap) send(client, snap(client.user))
    }

    socket.on('message', (raw) => {
      let msg: { t?: string; auth?: string; dev?: number; room?: string | null; ping?: number }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg.t === 'auth') {
        const user = authFrom(typeof msg.auth === 'string' ? msg.auth : null, msg.dev)
        client.user = user
        client.key = user ? `u${user.id}` : client.key
        if (user) rememberPhoto(user)
        onlineDirty = true
        send(client, { t: 'me', id: user?.id ?? null })
        // После входа снимок раздела нужен заново: в нём отмечены свои ставки
        if (client.room) enter(client.room)
      } else if (msg.t === 'join') {
        const room = typeof msg.room === 'string' && ROOM_RE.test(msg.room) ? msg.room : null
        enter(room)
      } else if (msg.t === 'ping') {
        // По ответу клиент сверяет часы с сервером: таймер раунда у всех одинаковый
        send(client, { t: 'pong', ping: msg.ping, now: Date.now() })
      }
    })

    socket.on('close', () => {
      clients.delete(client)
      onlineDirty = true
    })
  })
}
