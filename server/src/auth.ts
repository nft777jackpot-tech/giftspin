// Вход игрока. В Telegram сайт присылает initData, сервер проверяет её подпись токеном бота.
// Без Telegram, только в testnet и с DEV_AUTH=1, можно войти тестовым игроком по заголовку x-dev-user
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { config } from './config.ts'

export interface AuthUser {
  id: number
  name: string
  username: string | null
}

const MAX_AGE_SEC = 24 * 3600

export function verifyInitData(initData: string, botToken: string): AuthUser | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(checkString).digest('hex')
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null

  try {
    const user = JSON.parse(params.get('user') ?? 'null')
    if (!user || typeof user.id !== 'number') return null
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || `id${user.id}`
    return { id: user.id, name, username: user.username ?? null }
  } catch {
    return null
  }
}

export function authenticate(req: FastifyRequest): AuthUser | null {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('tma ') && config.botToken) return verifyInitData(header.slice(4), config.botToken)
  if (config.devAuth) {
    const dev = Number(req.headers['x-dev-user'])
    if (Number.isInteger(dev) && dev > 0 && dev < 1000) return { id: dev, name: `Тестовый игрок ${dev}`, username: null }
  }
  return null
}

export function isAdmin(req: FastifyRequest): boolean {
  const token = req.headers['x-admin-token']
  if (!config.adminToken || typeof token !== 'string' || token.length !== config.adminToken.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(config.adminToken))
}
