// Бот: приветствие на /start с кнопкой запуска Mini App и ссылкой на канал. Обновления бот получает
// одним опросом getUpdates: сообщения в личке — сюда, сообщения аккаунта-склада — на склад.
import type { FastifyBaseLogger } from 'fastify'
import { config } from './config.ts'
import { kv } from './db.ts'
import { botApi, type TgUpdate } from './telegram.ts'
import { handleUpdate } from './warehouse.ts'

const UPDATES_OFFSET = 'telegram.offset'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function greeting(name: string): string {
  return [
    `🎁 <b>Добро пожаловать в GiftSpin, ${escapeHtml(name)}!</b>`,
    '',
    'Кейсы с NFT-подарками Telegram, краш, рулетка, PvP-джекпот, мины, плинко и дайс.',
    '',
    '• Раунды краша и рулетки общие для всех игроков, ставки видно вживую',
    '• Исход каждой игры можно проверить на странице «Честная игра»',
    '• Пополнение и вывод в TON, выигранные подарки — прямо в Telegram',
    '',
    'Жми «Играть» 👇',
  ].join('\n')
}

async function onMessage(u: TgUpdate, log: FastifyBaseLogger) {
  const m = u.message
  if (!m?.text || !m.from || m.chat?.type !== 'private') return
  if (!m.text.startsWith('/start')) return
  await botApi('sendMessage', {
    chat_id: m.chat.id,
    text: greeting(m.from.first_name || 'игрок'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎰 Играть', web_app: { url: config.miniAppUrl } }],
        [{ text: '📢 Инфо канал', url: `https://t.me/${config.channel.replace(/^@/, '')}` }],
      ],
    },
  })
  log.info({ user: m.from.id }, 'бот: приветствие на /start')
}

/** Один опрос обновлений бота. getUpdates сам ждёт до 25 секунд, если новых нет. */
export async function pollBot(log: FastifyBaseLogger) {
  if (!config.botToken) return
  const allowed = ['message', ...(config.warehouse === 'telegram' ? ['business_connection', 'business_message'] : [])]
  const offset = Number(kv.get(UPDATES_OFFSET) ?? 0)
  const updates = await botApi<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: allowed }, 35_000)
  for (const u of updates) {
    try {
      if (u.message) await onMessage(u, log)
      else if (config.warehouse === 'telegram') await handleUpdate(u, log)
    } catch (e) {
      log.error({ err: String(e), update: u.update_id }, 'не удалось обработать обновление бота')
    }
    kv.set(UPDATES_OFFSET, String(u.update_id + 1))
  }
}

/** Команда в меню бота. Кнопку запуска Mini App задают в @BotFather. */
export async function setupBot(log: FastifyBaseLogger) {
  if (!config.botToken) return
  await botApi('setMyCommands', { commands: [{ command: 'start', description: 'Открыть казино' }] }).catch((e) => log.warn({ err: String(e) }, 'бот: команды не заданы'))
}
