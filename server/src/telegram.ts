// Telegram Bot API: подарки аккаунта-склада и обновления бота. Только нужные поля из документации
import { config } from './config.ts'

export class TelegramError extends Error {}

export async function botApi<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
  if (!config.botToken) throw new TelegramError('BOT_TOKEN не задан')
  // В тексте ошибок нет адреса запроса: в нём токен бота
  let res: Response
  try {
    res = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    throw new TelegramError(`${method}: сеть недоступна (${(e as Error).name})`)
  }
  const data = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null
  if (!data?.ok) throw new TelegramError(`${method}: ${data?.description ?? `HTTP ${res.status}`}`)
  return data.result as T
}

export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

export interface UniqueGift {
  base_name: string
  /** Уникальное имя для ссылок t.me/nft/…, например PlushPepe-368. */
  name: string
  number: number
  model: { name: string }
  symbol: { name: string }
  backdrop: { name: string }
}

export interface OwnedGift {
  type: 'regular' | 'unique'
  gift: UniqueGift
  owned_gift_id?: string
  can_be_transferred?: boolean
  transfer_star_count?: number
  next_transfer_date?: number
}

export interface OwnedGifts {
  total_count: number
  gifts: OwnedGift[]
  next_offset?: string
}

export interface BusinessConnection {
  id: string
  user: TgUser
  is_enabled: boolean
  rights?: Record<string, boolean>
}

export interface UniqueGiftInfo {
  gift: UniqueGift
  origin: string
  owned_gift_id?: string
  transfer_star_count?: number
  next_transfer_date?: number
}

export interface TgMessage {
  message_id: number
  from?: TgUser
  business_connection_id?: string
  unique_gift?: UniqueGiftInfo
}

export interface TgUpdate {
  update_id: number
  business_connection?: BusinessConnection
  business_message?: TgMessage
}
