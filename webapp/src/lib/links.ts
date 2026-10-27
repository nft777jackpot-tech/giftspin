import { BOT_USERNAME, CHANNEL } from '../config'

/** Ссылка-приглашение: бот запишет пригласившего по параметру start. */
export function refLink(userId?: number): string {
  return `https://t.me/${BOT_USERNAME}?start=ref_${userId ?? 'demo'}`
}

export const channelLink = () => `https://t.me/${CHANNEL.replace(/^@/, '')}`
export const botLink = (start?: string) => `https://t.me/${BOT_USERNAME}${start ? `?start=${start}` : ''}`
