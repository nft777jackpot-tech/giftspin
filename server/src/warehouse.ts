// Склад подарков: что лежит на аккаунте-складе, цены коллекций, инвентарь игроков, депозит и вывод подарков.
// Источник — Telegram (бизнес-аккаунт, к которому подключён бот) или тестовый список из fixtures/stock.json
import type { FastifyBaseLogger } from 'fastify'
import { readFileSync } from 'node:fs'
import { fromNano } from '@ton/core'
import { config } from './config.ts'
import { kv, q, transaction, type Row } from './db.ts'
import { applyLedger, ensureUser, LedgerError } from './ledger.ts'
import { botApi, type BusinessConnection, type OwnedGift, type OwnedGifts, type TgUpdate, type TgUser, type UniqueGift, type UniqueGiftInfo } from './telegram.ts'

const CONNECTION = 'warehouse.connection'
const ACCOUNT = 'warehouse.account'
const UPDATES_OFFSET = 'telegram.offset'
const MISSING = 'Подарка нет на складе'

/** Подарок со склада в нашем виде. slug — коллекция, как в ссылках Fragment: plushpepe. */
interface StockGift {
  id: string
  slug: string
  num: number
  title: string
  model: string | null
  backdrop: string | null
  symbol: string | null
  canTransfer: boolean
  transferStars: number
  transferAfter: number | null
}

interface Source {
  list(): Promise<StockGift[]>
  transfer(gift: { id: string; transferStars: number }, toUserId: number): Promise<void>
}

/** PlushPepe-368 → plushpepe. */
export const slugOf = (gift: UniqueGift) => gift.name.slice(0, gift.name.lastIndexOf('-')).toLowerCase()

function toStock(owned: OwnedGift): StockGift | null {
  if (owned.type !== 'unique' || !owned.owned_gift_id) return null
  const g = owned.gift
  return {
    id: owned.owned_gift_id,
    slug: slugOf(g),
    num: g.number,
    title: g.base_name,
    model: g.model?.name || null,
    backdrop: g.backdrop?.name || null,
    symbol: g.symbol?.name || null,
    canTransfer: !!owned.can_be_transferred,
    transferStars: owned.transfer_star_count ?? 0,
    transferAfter: owned.next_transfer_date ? owned.next_transfer_date * 1000 : null,
  }
}

const connectionId = () => kv.get(CONNECTION) || null

export function warehouseAccount(): { id: number; username: string | null; name: string } | null {
  const raw = kv.get(ACCOUNT)
  return raw ? JSON.parse(raw) : null
}

const telegramSource: Source = {
  async list() {
    const connection = connectionId()
    if (!connection) throw new Error('Склад не подключён: в аккаунте-складе откройте Telegram для бизнеса → Чат-боты и выберите бота')
    const all: StockGift[] = []
    let offset = ''
    for (let page = 0; page < 50; page++) {
      // Только уникальные подарки, которые можно передать внутри Telegram
      const res = await botApi<OwnedGifts>('getBusinessAccountGifts', {
        business_connection_id: connection,
        exclude_unlimited: true,
        exclude_limited_upgradable: true,
        exclude_limited_non_upgradable: true,
        exclude_from_blockchain: true,
        offset,
        limit: 100,
      })
      for (const g of res.gifts) {
        const s = toStock(g)
        if (s) all.push(s)
      }
      if (!res.next_offset) break
      offset = res.next_offset
    }
    return all
  },
  async transfer(gift, toUserId) {
    const connection = connectionId()
    if (!connection) throw new Error('Склад не подключён')
    await botApi('transferGift', {
      business_connection_id: connection,
      owned_gift_id: gift.id,
      new_owner_chat_id: toUserId,
      ...(gift.transferStars > 0 ? { star_count: gift.transferStars } : {}),
    })
  },
}

// Тестовый склад: тот же ответ, что у getBusinessAccountGifts. Переданные подарки помним до перезапуска
const fakeSent = new Set<string>()
const fakeSource: Source = {
  async list() {
    const doc = JSON.parse(readFileSync(new URL('../fixtures/stock.json', import.meta.url), 'utf8')) as OwnedGifts
    return doc.gifts.map(toStock).filter((g): g is StockGift => !!g && !fakeSent.has(g.id))
  },
  async transfer(gift) {
    fakeSent.add(gift.id)
  },
}

const source = (): Source | null => (config.warehouse === 'telegram' ? telegramSource : config.warehouse === 'fake' ? fakeSource : null)

// ---------- Сверка со складом ----------

const UPSERT = `INSERT INTO stock (id, slug, num, title, model, backdrop, symbol, can_transfer, transfer_stars, transfer_after, status, deposited_by, seen_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free', ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, num = excluded.num, title = excluded.title, model = excluded.model,
    backdrop = excluded.backdrop, symbol = excluded.symbol, can_transfer = excluded.can_transfer, transfer_stars = excluded.transfer_stars,
    transfer_after = excluded.transfer_after, seen_at = excluded.seen_at, updated_at = excluded.updated_at,
    deposited_by = COALESCE(stock.deposited_by, excluded.deposited_by),
    status = CASE WHEN stock.status = 'gone' THEN 'free' ELSE stock.status END,
    error = CASE WHEN stock.error = '${MISSING}' THEN NULL ELSE stock.error END`

function upsert(g: StockGift, depositedBy: number | null, now: number) {
  q(UPSERT).run(g.id, g.slug, g.num, g.title, g.model, g.backdrop, g.symbol, g.canTransfer ? 1 : 0, g.transferStars, g.transferAfter, depositedBy, now, now, now)
}

/** Сверяет базу со складом: новые подарки появляются на витрине, пропавшие с неё убираются. */
export async function syncStock(log: FastifyBaseLogger) {
  const src = source()
  if (!src) return
  const gifts = await src.list()
  const now = Date.now()
  const result = transaction(() => {
    for (const g of gifts) upsert(g, null, now)
    const gone = q("UPDATE stock SET status = 'gone', updated_at = ? WHERE status = 'free' AND seen_at < ?").run(now, now).changes
    // Подарок игрока пропал со склада: не трогаем, но помечаем для администратора
    const missing = q(`UPDATE stock SET error = '${MISSING}', updated_at = ? WHERE status IN ('reserved', 'withdrawing') AND seen_at < ? AND error IS NULL`).run(now, now).changes
    return { gone, missing }
  })
  log.info({ total: gifts.length, ...result }, 'склад сверен')
  if (result.missing) log.warn({ count: result.missing }, 'подарков игроков нет на складе, нужна проверка')
  // Подарки, которые стало можно передать, и депозиты, которым задали цену
  for (const row of pendingGiftDeposits()) creditDeposit(String(row.id), log)
}

// ---------- Обновления бота: подключение склада и депозиты подарком ----------

function rememberConnection(c: BusinessConnection, log: FastifyBaseLogger) {
  if (!c.is_enabled) {
    if (connectionId() === c.id) kv.set(CONNECTION, '')
    log.warn('склад отключён от бота')
    return
  }
  kv.set(CONNECTION, c.id)
  kv.set(ACCOUNT, JSON.stringify({ id: c.user.id, username: c.user.username ?? null, name: c.user.first_name }))
  log.info({ account: c.user.username ?? c.user.id }, 'склад подключён к боту')
  const missing = ['can_view_gifts_and_stars', 'can_transfer_and_upgrade_gifts', 'can_transfer_stars'].filter((r) => !c.rights?.[r])
  if (missing.length) log.warn({ missing }, 'боту не хватает прав на складе')
}

export async function handleUpdate(u: TgUpdate, log: FastifyBaseLogger) {
  if (u.business_connection) return rememberConnection(u.business_connection, log)
  const m = u.business_message
  if (!m) return
  // Обновление о подключении могло потеряться: узнаём склад по любому сообщению из него
  if (config.warehouse === 'telegram' && m.business_connection_id && !connectionId()) {
    rememberConnection(await botApi<BusinessConnection>('getBusinessConnection', { business_connection_id: m.business_connection_id }), log)
  }
  const info = m.unique_gift
  if (!info?.owned_gift_id || !m.from) return
  // Подарок, который склад отправил сам, — это вывод, а не депозит
  if (m.from.id === warehouseAccount()?.id) return
  depositGift(m.from, info, log)
}

/** Игрок прислал подарок на склад: подарок попадает на витрину, игроку — TON по цене коллекции. */
function depositGift(from: TgUser, info: UniqueGiftInfo, log: FastifyBaseLogger) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || `id${from.id}`
  const user = ensureUser(from.id, name, from.username ?? null)
  const gift = toStock({
    type: 'unique',
    gift: info.gift,
    owned_gift_id: info.owned_gift_id,
    // Число звёзд за передачу приходит, только если бот может передать подарок
    can_be_transferred: info.transfer_star_count !== undefined,
    transfer_star_count: info.transfer_star_count,
    next_transfer_date: info.next_transfer_date,
  })!
  transaction(() => upsert(gift, user.id, Date.now()))
  log.info({ user: user.id, gift: info.gift.name }, 'депозит подарком')
  creditDeposit(gift.id, log)
}

/**
 * Зачисляет депозит подарком по цене коллекции. Пока цены нет, депозит ждёт администратора.
 * Подарок с маркета Telegram первые 21 день нельзя передать дальше: такой депозит зачисляется, когда это станет можно.
 */
function creditDeposit(id: string, log: FastifyBaseLogger) {
  transaction(() => {
    const row = q('SELECT s.deposited_by, s.slug, s.credited, s.transfer_after, p.price_nano FROM stock s LEFT JOIN gift_prices p ON p.slug = s.slug WHERE s.id = ?').get(id)
    if (!row?.deposited_by || row.credited) return
    if (row.transfer_after && Number(row.transfer_after) > Date.now()) return
    if (!row.price_nano) {
      log.warn({ id, slug: row.slug }, 'депозит подарком ждёт цену коллекции')
      return
    }
    q('UPDATE stock SET credited = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
    applyLedger(Number(row.deposited_by), 'gift_deposit', row.price_nano as bigint, `gift:${id}`)
    log.info({ id, amount: fromNano(row.price_nano as bigint) }, 'депозит подарком зачислен')
  })
}

/** Забирает обновления бота long polling'ом: сайт не обязан быть доступен из интернета. */
export async function pollUpdates(log: FastifyBaseLogger) {
  if (config.warehouse !== 'telegram') return
  const offset = Number(kv.get(UPDATES_OFFSET) ?? 0)
  const updates = await botApi<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['business_connection', 'business_message'] }, 35_000)
  for (const u of updates) {
    try {
      await handleUpdate(u, log)
    } catch (e) {
      log.error({ err: String(e), update: u.update_id }, 'не удалось обработать обновление бота')
    }
    kv.set(UPDATES_OFFSET, String(u.update_id + 1))
  }
}

// ---------- Витрина и инвентарь ----------

/** Подарок можно выиграть: свободен и Telegram разрешает передать его сейчас. */
const AVAILABLE = "s.status = 'free' AND s.can_transfer = 1 AND (s.transfer_after IS NULL OR s.transfer_after <= ?)"

/** Коллекции на витрине: только то, что есть на складе и с ценой. */
export function showcase() {
  return q(
    `SELECT s.slug, MIN(s.title) AS title, COUNT(*) AS count, MIN(s.num) AS num, p.price_nano FROM stock s
     JOIN gift_prices p ON p.slug = s.slug WHERE ${AVAILABLE} GROUP BY s.slug ORDER BY p.price_nano DESC`,
  ).all(Date.now())
}

export function userGifts(userId: number) {
  return q(
    `SELECT s.id, s.slug, s.num, s.title, s.model, s.backdrop, s.status, s.error, s.updated_at, p.price_nano FROM stock s
     LEFT JOIN gift_prices p ON p.slug = s.slug WHERE s.user_id = ? AND s.status IN ('reserved', 'withdrawing', 'transferring', 'sent')
     ORDER BY s.updated_at DESC LIMIT 100`,
  ).all(userId)
}

const priceOf = (slug: string) => (q('SELECT price_nano FROM gift_prices WHERE slug = ?').get(slug)?.price_nano as bigint | undefined) ?? null

/**
 * Игрок выиграл подарок коллекции slug: закрепляем за ним свободный экземпляр.
 * Если последний уже забрали, игрок получает цену подарка в TON.
 */
export function winGift(userId: number, slug: string, ref: string): { item: Row } | { credited: bigint; balance: bigint } {
  return transaction(() => {
    const price = priceOf(slug)
    if (!price) throw new LedgerError('Этого подарка нет на витрине')
    const row = q(`SELECT s.id FROM stock s WHERE s.slug = ? AND ${AVAILABLE} ORDER BY s.created_at LIMIT 1`).get(slug, Date.now())
    if (!row) return { credited: price, balance: applyLedger(userId, 'win', price, ref) }
    q("UPDATE stock SET status = 'reserved', user_id = ?, error = NULL, updated_at = ? WHERE id = ?").run(userId, Date.now(), row.id as string)
    return { item: userGifts(userId).find((g) => g.id === row.id)! }
  })
}

/** Подарки ушли в ставку и проиграны: возвращаются на витрину. */
export function releaseGifts(userId: number, ids: string[]): number {
  return transaction(() =>
    ids.reduce((n, id) => n + Number(q("UPDATE stock SET status = 'free', user_id = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'reserved'").run(Date.now(), id, userId).changes), 0),
  )
}

/** Продажа подарков казино по цене коллекции: подарок возвращается на витрину, игроку — TON. */
export function sellGifts(userId: number, ids: string[]): { count: number; amount: bigint; balance: bigint | null } {
  return transaction(() => {
    let amount = 0n
    let count = 0
    let balance: bigint | null = null
    for (const id of ids) {
      const row = q("SELECT s.slug, p.price_nano FROM stock s LEFT JOIN gift_prices p ON p.slug = s.slug WHERE s.id = ? AND s.user_id = ? AND s.status = 'reserved'").get(id, userId)
      if (!row) continue
      if (!row.price_nano) throw new LedgerError('У подарка нет цены, продать пока нельзя')
      q("UPDATE stock SET status = 'free', user_id = NULL, updated_at = ? WHERE id = ?").run(Date.now(), id)
      balance = applyLedger(userId, 'gift_sell', row.price_nano as bigint, `gift:${id}`)
      amount += row.price_nano as bigint
      count++
    }
    return { count, amount, balance }
  })
}

/** Заявка на вывод: подарок ждёт проверки администратора, потом бот передаёт его игроку. */
export function requestGiftWithdrawal(userId: number, ids: string[]): number {
  return transaction(() =>
    ids.reduce((n, id) => n + Number(q("UPDATE stock SET status = 'withdrawing', error = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'reserved'").run(Date.now(), id, userId).changes), 0),
  )
}

// ---------- Админка ----------

export function warehouseStatus() {
  const account = warehouseAccount()
  return { mode: config.warehouse, connected: config.warehouse === 'fake' || !!connectionId(), account: account?.username ?? null }
}

/** Коллекции со склада со счётчиками по статусам и ценой. */
export function stockOverview() {
  return q(
    `SELECT s.slug, MIN(s.title) AS title, MIN(s.num) AS num,
       SUM(s.status = 'free') AS free, SUM(s.status = 'free' AND (s.can_transfer = 0 OR s.transfer_after > ?)) AS locked,
       SUM(s.status IN ('reserved', 'withdrawing', 'transferring')) AS players, SUM(s.status = 'sent') AS sent, p.price_nano
     FROM stock s LEFT JOIN gift_prices p ON p.slug = s.slug WHERE s.status != 'gone' GROUP BY s.slug ORDER BY p.price_nano DESC NULLS LAST, s.slug`,
  ).all(Date.now())
}

/** Депозиты подарком, которые ещё не зачислены: ждут цену коллекции или разрешения Telegram передать подарок. */
export function pendingGiftDeposits() {
  return q(
    `SELECT s.id, s.slug, s.num, s.title, s.deposited_by, s.transfer_after, s.created_at, p.price_nano FROM stock s
     LEFT JOIN gift_prices p ON p.slug = s.slug WHERE s.deposited_by IS NOT NULL AND s.credited = 0 ORDER BY s.created_at`,
  ).all()
}

/** Задаёт цены коллекций. 0 или пусто — убрать цену, коллекция пропадёт с витрины. Ждущие цену депозиты зачисляются. */
export function setPrices(prices: Record<string, bigint | null>, log: FastifyBaseLogger) {
  transaction(() => {
    for (const [slug, price] of Object.entries(prices)) {
      if (price && price > 0n) {
        q('INSERT INTO gift_prices (slug, price_nano, updated_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET price_nano = excluded.price_nano, updated_at = excluded.updated_at').run(slug, price, Date.now())
      } else {
        q('DELETE FROM gift_prices WHERE slug = ?').run(slug)
      }
    }
  })
  for (const row of pendingGiftDeposits()) creditDeposit(String(row.id), log)
}

export function giftWithdrawals() {
  return q(
    `SELECT s.id, s.slug, s.num, s.title, s.status, s.error, s.transfer_stars, s.transfer_after, s.updated_at, u.id AS user_id, u.name, u.username
     FROM stock s JOIN users u ON u.id = s.user_id WHERE s.status IN ('withdrawing', 'transferring') ORDER BY s.updated_at`,
  ).all()
}

/** Администратор подтвердил вывод: бот передаёт подарок игроку. Повторная передача того же подарка невозможна. */
export async function approveGiftWithdrawal(id: string, log: FastifyBaseLogger): Promise<{ ok: boolean; error?: string }> {
  const src = source()
  if (!src) return { ok: false, error: 'Склад не подключён' }
  const row = q("UPDATE stock SET status = 'transferring', updated_at = ? WHERE id = ? AND status = 'withdrawing' RETURNING user_id, transfer_stars").get(Date.now(), id)
  if (!row) return { ok: false, error: 'Заявка уже обработана' }
  try {
    await src.transfer({ id, transferStars: Number(row.transfer_stars) }, Number(row.user_id))
  } catch (e) {
    const error = String((e as Error).message ?? e).slice(0, 200)
    q("UPDATE stock SET status = 'withdrawing', error = ?, updated_at = ? WHERE id = ?").run(error, Date.now(), id)
    log.warn({ id, error }, 'подарок не передан')
    return { ok: false, error }
  }
  q("UPDATE stock SET status = 'sent', error = NULL, updated_at = ? WHERE id = ?").run(Date.now(), id)
  log.info({ id, user: Number(row.user_id) }, 'подарок передан игроку')
  return { ok: true }
}

/** Отказ: подарок остаётся у игрока в инвентаре с пояснением. */
export function rejectGiftWithdrawal(id: string, reason: string): boolean {
  return q("UPDATE stock SET status = 'reserved', error = ?, updated_at = ? WHERE id = ? AND status = 'withdrawing'").run(reason, Date.now(), id).changes > 0
}

/** Сервер упал посреди передачи: неизвестно, ушёл ли подарок. Такие заявки снова ждут проверки. */
export function recoverGiftTransfers() {
  q("UPDATE stock SET status = 'withdrawing', error = 'Сервер перезапустился во время передачи: проверьте, у кого подарок', updated_at = ? WHERE status = 'transferring'").run(Date.now())
}
