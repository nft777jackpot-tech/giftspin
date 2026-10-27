// Приём депозитов: следим за входящими переводами на кошелёк проекта и зачисляем их по коду в комментарии
import type { FastifyBaseLogger } from 'fastify'
import { fromNano } from '@ton/core'
import { config } from './config.ts'
import { kv, q, transaction } from './db.ts'
import { applyLedger, findUserByMemo } from './ledger.ts'
import { friendly, hotAddress, incomingAfter, type Incoming } from './ton.ts'

const LAST_LT = 'deposits.last_lt'

export type DepositStatus = 'credited' | 'unmatched' | 'too_small' | 'bounced'

function record(inc: Incoming, status: DepositStatus, userId: number | null): boolean {
  const res = q('INSERT OR IGNORE INTO deposits (tx_hash, lt, user_id, amount_nano, comment, sender, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    inc.hash,
    inc.lt.toString(),
    userId,
    inc.amount,
    inc.comment,
    inc.sender,
    status,
    Date.now(),
  )
  return res.changes > 0
}

export function handleIncoming(inc: Incoming, log: FastifyBaseLogger) {
  const own = friendly(hotAddress())
  // Отскоки и сдача от собственных переводов кошелька — не депозиты
  if (inc.bounced || inc.sender === own) {
    record(inc, 'bounced', null)
    return
  }
  if (inc.amount < config.minDeposit) {
    record(inc, 'too_small', null)
    log.info({ hash: inc.hash, amount: fromNano(inc.amount) }, 'депозит меньше минимума, не зачислен')
    return
  }
  const user = inc.comment ? findUserByMemo(inc.comment.trim().toUpperCase()) : null
  if (!user) {
    record(inc, 'unmatched', null)
    log.warn({ hash: inc.hash, comment: inc.comment, amount: fromNano(inc.amount) }, 'депозит без известного кода, нужна ручная проверка')
    return
  }
  // Запись о депозите и зачисление — одна транзакция: повтор того же перевода ничего не зачислит
  transaction(() => {
    if (record(inc, 'credited', user.id)) applyLedger(user.id, 'deposit', inc.amount, `tx:${inc.hash}`)
  })
  log.info({ user: user.id, amount: fromNano(inc.amount) }, 'депозит зачислен')
}

/** Один проход: забирает новые переводы и запоминает, до какой транзакции дошёл. */
export async function pollDeposits(log: FastifyBaseLogger) {
  const afterLt = BigInt(kv.get(LAST_LT) ?? '0')
  const list = await incomingAfter(afterLt)
  for (const inc of list) {
    handleIncoming(inc, log)
    kv.set(LAST_LT, inc.lt.toString())
  }
}

export function userDeposits(userId: number, limit = 20) {
  return q('SELECT tx_hash, amount_nano, status, created_at FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit)
}

export function unmatchedDeposits(limit = 50) {
  return q("SELECT tx_hash, amount_nano, comment, sender, status, created_at FROM deposits WHERE status IN ('unmatched', 'too_small') ORDER BY created_at DESC LIMIT ?").all(limit)
}
