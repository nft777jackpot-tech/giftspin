import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { readFileSync } from 'node:fs'
import { fromNano, toNano } from '@ton/core'
import { authenticate, isAdmin } from './auth.ts'
import { config, NETWORK, TON_CONNECT_CHAIN } from './config.ts'
import type { Row } from './db.ts'
import { unmatchedDeposits, userDeposits } from './deposits.ts'
import { ensureSeeds, openCase, playDice, playPlinko, revealedSeeds, rotateSeeds, SERVER_GAMES } from './games.ts'
import { changeBalance, ensureUser, history, LedgerError, type User } from './ledger.ts'
import { commentPayload, friendly, hotAddress, hotBalance } from './ton.ts'
import type { TgUpdate } from './telegram.ts'
import {
  approveGiftWithdrawal,
  giftWithdrawals,
  handleUpdate,
  pendingGiftDeposits,
  rejectGiftWithdrawal,
  releaseGifts,
  requestGiftWithdrawal,
  sellGifts,
  setPrices,
  showcase,
  stockOverview,
  syncStock,
  userGifts,
  warehouseStatus,
  winGift,
} from './warehouse.ts'
import { approveWithdrawal, rejectWithdrawal, requestWithdrawal, reviewQueue, userWithdrawals } from './withdrawals.ts'

const ton = (nano: unknown) => fromNano(nano as bigint)
const AMOUNT_RE = /^\d{1,9}(\.\d{1,9})?$/
/** Потолок одной ставки или выигрыша, который принимаем от сайта, пока игры не перенесены на сервер. */
const MAX_GAME_AMOUNT = toNano('1000')

function parseAmount(value: unknown): bigint {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!AMOUNT_RE.test(text)) throw new LedgerError('Неверная сумма')
  const nano = toNano(text)
  if (nano <= 0n) throw new LedgerError('Сумма должна быть больше нуля')
  return nano
}

const SLUG_RE = /^[a-z0-9]{2,40}$/

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new LedgerError('Не выбраны подарки')
  return value.map((v) => String(v).slice(0, 128))
}

const giftOut = (g: Row) => ({
  id: g.id,
  slug: g.slug,
  num: Number(g.num),
  name: g.title,
  model: g.model,
  backdrop: g.backdrop,
  price: g.price_nano ? ton(g.price_nano) : null,
  status: g.status,
  error: g.error,
})

function requireUser(req: FastifyRequest, reply: FastifyReply): User | null {
  const auth = authenticate(req)
  if (!auth) {
    reply.code(401).send({ error: 'Нужен вход через Telegram' })
    return null
  }
  return ensureUser(auth.id, auth.name, auth.username)
}

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof LedgerError) return reply.code(400).send({ error: e.message })
  throw e
}

export function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true, network: NETWORK }))

  app.get('/api/me', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return {
      id: user.id,
      name: user.name,
      memo: user.memo,
      balance: ton(user.balance),
      network: NETWORK,
      depositAddress: friendly(hotAddress()),
      trustClientGames: config.trustClientGames,
      serverGames: SERVER_GAMES,
      limits: {
        minDeposit: ton(config.minDeposit),
        minWithdraw: ton(config.minWithdraw),
        maxWithdraw: ton(config.maxWithdraw),
        withdrawFee: ton(config.withdrawFee),
        reviewOver: ton(config.reviewOver),
      },
    }
  })

  // Всё для перевода через TON Connect: адрес проекта и комментарий с кодом игрока
  app.get('/api/deposit', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return {
      address: friendly(hotAddress()),
      memo: user.memo,
      payload: commentPayload(user.memo),
      chain: TON_CONNECT_CHAIN,
      minDeposit: ton(config.minDeposit),
      deposits: userDeposits(user.id).map((d) => ({ hash: d.tx_hash, amount: ton(d.amount_nano), status: d.status, at: Number(d.created_at) })),
    }
  })

  app.get('/api/history', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return history(user.id).map((h) => ({ kind: h.kind, amount: ton(h.amount_nano), balance: ton(h.balance_after), ref: h.ref, at: Number(h.created_at) }))
  })

  app.get('/api/withdrawals', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return userWithdrawals(user.id).map((w) => ({
      id: Number(w.id),
      address: w.address,
      amount: ton(w.amount_nano),
      fee: ton(w.fee_nano),
      status: w.status,
      hash: w.tx_hash,
      error: w.error,
      at: Number(w.created_at),
    }))
  })

  app.post<{ Body: { address?: string; amount?: string } }>('/api/withdrawals', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      const res = requestWithdrawal(user.id, String(req.body?.address ?? ''), parseAmount(req.body?.amount))
      return { id: res.id, status: res.status, balance: ton(res.balance) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  // Честная игра: текущая пара сидов игрока и раскрытые прошлые пары для проверки
  app.get('/api/fair', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const seeds = ensureSeeds(user.id)
    return { ...seeds, revealed: revealedSeeds(user.id).map((r) => ({ hash: r.server_hash, serverSeed: r.server_seed, clientSeed: r.client_seed, nonce: Number(r.nonce) })) }
  })

  // Смена пары сидов: старый серверный сид раскрывается, выдаётся новый хеш
  app.post<{ Body: { clientSeed?: string } }>('/api/fair/rotate', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    const prev = ensureSeeds(user.id)
    const next = rotateSeeds(user.id, String(req.body?.clientSeed ?? '').slice(0, 64))
    return { ...next, revealedHash: prev.hash }
  })

  // Дайс на сервере: сервер сам считает исход и меняет баланс. Клиент только показывает результат
  app.post<{ Body: { amount?: string; chance?: number; over?: boolean } }>('/api/games/dice', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      const chance = Number(req.body?.chance)
      return playDice(user.id, parseAmount(req.body?.amount), chance, !!req.body?.over)
    } catch (e) {
      return fail(reply, e)
    }
  })

  // Плинко на сервере: путь шарика и множитель считает сервер
  app.post<{ Body: { amount?: string; rows?: number; risk?: string } }>('/api/games/plinko', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      return playPlinko(user.id, parseAmount(req.body?.amount), Number(req.body?.rows) as 8 | 12 | 16, String(req.body?.risk) as 'low' | 'mid' | 'high')
    } catch (e) {
      return fail(reply, e)
    }
  })

  // Кейсы на сервере: призы выбирает сервер и сразу зачисляет монеты
  app.post<{ Body: { caseId?: string; count?: number } }>('/api/games/case', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      return openCase(user.id, String(req.body?.caseId ?? ''), Number(req.body?.count ?? 1))
    } catch (e) {
      return fail(reply, e)
    }
  })

  // Временное: ставки и выигрыши считает сайт. Только testnet, до переноса игр на сервер
  app.post<{ Body: { amount?: string; game?: string }; Params: { kind: 'bet' | 'win' } }>('/api/game/:kind', async (req, reply) => {
    if (!config.trustClientGames) return reply.code(403).send({ error: 'Игры на сервере ещё не подключены' })
    const user = requireUser(req, reply)
    if (!user) return
    const kind = req.params.kind
    if (kind !== 'bet' && kind !== 'win') return reply.code(404).send({ error: 'Нет такой операции' })
    try {
      const amount = parseAmount(req.body?.amount)
      if (amount > MAX_GAME_AMOUNT) throw new LedgerError('Слишком большая сумма')
      const game = String(req.body?.game ?? '').slice(0, 60) || null
      const balance = changeBalance(user.id, kind, kind === 'bet' ? -amount : amount, game)
      return { balance: ton(balance) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  // ---------- Склад подарков ----------

  // Витрина: коллекции, которые лежат на складе, свободны и с ценой
  app.get('/api/stock', async () => ({
    ...warehouseStatus(),
    gifts: showcase().map((s) => ({ slug: s.slug, name: s.title, count: Number(s.count), num: Number(s.num), price: ton(s.price_nano) })),
  }))

  app.get('/api/inventory', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    return userGifts(user.id).map(giftOut)
  })

  // Временное, как /api/game: выигрыш и проигрыш подарков считает сайт. Только testnet, вывод всё равно проверяет администратор
  app.post<{ Body: { slug?: string; game?: string } }>('/api/gifts/win', async (req, reply) => {
    if (!config.trustClientGames) return reply.code(403).send({ error: 'Игры на сервере ещё не подключены' })
    const user = requireUser(req, reply)
    if (!user) return
    try {
      const slug = String(req.body?.slug ?? '')
      if (!SLUG_RE.test(slug)) throw new LedgerError('Неверный подарок')
      const res = winGift(user.id, slug, String(req.body?.game ?? '').slice(0, 60) || 'gift')
      return 'item' in res ? { item: giftOut(res.item) } : { credited: ton(res.credited), balance: ton(res.balance) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  app.post<{ Body: { ids?: unknown } }>('/api/gifts/release', async (req, reply) => {
    if (!config.trustClientGames) return reply.code(403).send({ error: 'Игры на сервере ещё не подключены' })
    const user = requireUser(req, reply)
    if (!user) return
    try {
      return { count: releaseGifts(user.id, parseIds(req.body?.ids)) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  app.post<{ Body: { ids?: unknown } }>('/api/gifts/sell', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      const res = sellGifts(user.id, parseIds(req.body?.ids))
      return { count: res.count, amount: ton(res.amount), balance: ton(res.balance ?? user.balance) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  app.post<{ Body: { ids?: unknown } }>('/api/gifts/withdraw', async (req, reply) => {
    const user = requireUser(req, reply)
    if (!user) return
    try {
      return { count: requestGiftWithdrawal(user.id, parseIds(req.body?.ids)) }
    } catch (e) {
      return fail(reply, e)
    }
  })

  // Страница админки. Токен вводится на ней и уходит только в заголовке x-admin-token
  const adminPage = readFileSync(new URL('../admin.html', import.meta.url), 'utf8')
  app.get('/admin', async (_req, reply) => reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(adminPage))

  // ---------- Админка: по заголовку x-admin-token ----------

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/admin/') && !isAdmin(req)) return reply.code(403).send({ error: 'Нет доступа' })
  })

  app.get('/api/admin/wallet', async () => ({ address: friendly(hotAddress()), balance: ton(await hotBalance()), network: NETWORK }))

  app.get('/api/admin/withdrawals', async () =>
    reviewQueue().map((w) => ({ id: Number(w.id), user: Number(w.user_id), address: w.address, amount: ton(w.amount_nano), error: w.error, at: Number(w.created_at) })),
  )

  app.post<{ Params: { id: string } }>('/api/admin/withdrawals/:id/approve', async (req) => ({ ok: approveWithdrawal(Number(req.params.id)) }))

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/admin/withdrawals/:id/reject', async (req) => ({
    ok: rejectWithdrawal(Number(req.params.id), String(req.body?.reason ?? 'Отклонено администратором').slice(0, 200)),
  }))

  app.get('/api/admin/stock', async () => ({
    ...warehouseStatus(),
    collections: stockOverview().map((c) => ({
      slug: c.slug,
      name: c.title,
      num: Number(c.num),
      free: Number(c.free),
      locked: Number(c.locked),
      players: Number(c.players),
      sent: Number(c.sent),
      price: c.price_nano ? ton(c.price_nano) : null,
    })),
    pending: pendingGiftDeposits().map((d) => ({
      id: d.id,
      slug: d.slug,
      num: Number(d.num),
      name: d.title,
      user: Number(d.deposited_by),
      price: d.price_nano ? ton(d.price_nano) : null,
      transferAfter: d.transfer_after ? Number(d.transfer_after) : null,
      at: Number(d.created_at),
    })),
    withdrawals: giftWithdrawals().map((w) => ({
      id: w.id,
      slug: w.slug,
      num: Number(w.num),
      name: w.title,
      status: w.status,
      error: w.error,
      stars: Number(w.transfer_stars),
      transferAfter: w.transfer_after ? Number(w.transfer_after) : null,
      user: { id: Number(w.user_id), name: w.name, username: w.username },
      at: Number(w.updated_at),
    })),
  }))

  app.post('/api/admin/stock/sync', async (req) => {
    await syncStock(req.log)
    return { ok: true }
  })

  app.put<{ Body: { prices?: Record<string, string> } }>('/api/admin/prices', async (req, reply) => {
    try {
      const prices: Record<string, bigint | null> = {}
      for (const [slug, value] of Object.entries(req.body?.prices ?? {})) {
        if (!SLUG_RE.test(slug)) throw new LedgerError(`Неверная коллекция: ${slug}`)
        const text = String(value ?? '').trim()
        prices[slug] = text === '' || Number(text) === 0 ? null : parseAmount(text)
      }
      setPrices(prices, req.log)
      return { ok: true }
    } catch (e) {
      return fail(reply, e)
    }
  })

  app.post<{ Params: { id: string } }>('/api/admin/gift-withdrawals/:id/approve', async (req) => approveGiftWithdrawal(req.params.id, req.log))

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/admin/gift-withdrawals/:id/reject', async (req) => ({
    ok: rejectGiftWithdrawal(req.params.id, String(req.body?.reason ?? 'Отклонено администратором').slice(0, 200)),
  }))

  // Только тестовый склад: подсунуть обновление бота, например депозит подарком, без настоящего Telegram
  app.post<{ Body: TgUpdate }>('/api/admin/fake-update', async (req, reply) => {
    if (config.warehouse !== 'fake') return reply.code(404).send({ error: 'Только для тестового склада' })
    await handleUpdate(req.body, req.log)
    return { ok: true }
  })

  app.get('/api/admin/deposits', async () =>
    unmatchedDeposits().map((d) => ({ hash: d.tx_hash, amount: ton(d.amount_nano), comment: d.comment, sender: d.sender, status: d.status, at: Number(d.created_at) })),
  )
}
