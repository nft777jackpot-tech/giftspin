// Выводы: заявка сразу списывает сумму с баланса, очередь по одной отправляет переводы с горячего кошелька.
// Крупные суммы и всё непонятное уходят на ручную проверку, а не отправляются вслепую
import type { FastifyBaseLogger } from 'fastify'
import { fromNano } from '@ton/core'
import { config } from './config.ts'
import { q, transaction } from './db.ts'
import { applyLedger, LedgerError } from './ledger.ts'
import { broadcast, findOutgoing, friendly, hotBalance, hotSeqno, parseAddress, signTransfer, type SignedTransfer } from './ton.ts'

export type WithdrawalStatus = 'queued' | 'review' | 'sending' | 'sent' | 'failed' | 'rejected'

const DAY = 24 * 3600 * 1000
const CONFIRM_TIMEOUT_MS = 90_000

const comment = (id: number) => `GiftSpin #${id}`

function setStatus(id: number, status: WithdrawalStatus, extra: { seqno?: number; tx_hash?: string; error?: string | null } = {}) {
  q('UPDATE withdrawals SET status = ?, seqno = COALESCE(?, seqno), tx_hash = COALESCE(?, tx_hash), error = ?, updated_at = ? WHERE id = ?').run(
    status,
    extra.seqno ?? null,
    extra.tx_hash ?? null,
    extra.error ?? null,
    Date.now(),
    id,
  )
}

/** Заявка на вывод. amount — сколько списать с баланса, игрок получит amount минус комиссию. */
export function requestWithdrawal(userId: number, addressText: string, amount: bigint) {
  let address: string
  try {
    address = friendly(parseAddress(addressText))
  } catch {
    throw new LedgerError('Неверный адрес кошелька')
  }
  if (amount < config.minWithdraw) throw new LedgerError(`Минимум ${fromNano(config.minWithdraw)} TON`)
  if (amount > config.maxWithdraw) throw new LedgerError(`Максимум ${fromNano(config.maxWithdraw)} TON за раз`)
  if (amount <= config.withdrawFee) throw new LedgerError('Сумма меньше комиссии')

  return transaction(() => {
    const today = q("SELECT COALESCE(SUM(amount_nano), 0) AS s FROM withdrawals WHERE user_id = ? AND created_at > ? AND status NOT IN ('failed', 'rejected')").get(userId, Date.now() - DAY)
    if ((today?.s as bigint) + amount > config.dailyWithdraw) throw new LedgerError(`Лимит вывода — ${fromNano(config.dailyWithdraw)} TON в сутки`)
    const status: WithdrawalStatus = amount > config.reviewOver ? 'review' : 'queued'
    const now = Date.now()
    const row = q('INSERT INTO withdrawals (user_id, address, amount_nano, fee_nano, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').get(
      userId,
      address,
      amount,
      config.withdrawFee,
      status,
      now,
      now,
    )
    const id = Number(row!.id)
    const balance = applyLedger(userId, 'withdraw', -amount, `w:${id}`)
    return { id, status, balance }
  })
}

function refund(id: number, status: 'failed' | 'rejected', error: string) {
  transaction(() => {
    const w = q('SELECT user_id, amount_nano, status FROM withdrawals WHERE id = ?').get(id)
    if (!w || w.status === 'sent' || w.status === 'failed' || w.status === 'rejected') return
    setStatus(id, status, { error })
    applyLedger(Number(w.user_id), 'withdraw_refund', w.amount_nano as bigint, `w:${id}`)
  })
}

export function approveWithdrawal(id: number): boolean {
  return q("UPDATE withdrawals SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND status = 'review'").run(Date.now(), id).changes > 0
}

export function rejectWithdrawal(id: number, reason: string): boolean {
  const w = q('SELECT status FROM withdrawals WHERE id = ?').get(id)
  if (w?.status !== 'review') return false
  refund(id, 'rejected', reason)
  return true
}

/** Если сервер упал посреди отправки, неизвестно, ушли ли деньги: такие заявки проверяет человек. */
export function recoverInterrupted() {
  q("UPDATE withdrawals SET status = 'review', error = 'Сервер перезапустился во время отправки: проверьте по блокчейну', updated_at = ? WHERE status = 'sending'").run(Date.now())
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Обрабатывает одну заявку из очереди. */
export async function processNextWithdrawal(log: FastifyBaseLogger) {
  const w = q("SELECT * FROM withdrawals WHERE status = 'queued' ORDER BY id LIMIT 1").get()
  if (!w) return
  const id = Number(w.id)
  const send = (w.amount_nano as bigint) - (w.fee_nano as bigint)

  const balance = await hotBalance()
  if (balance < send + config.gasReserve) {
    setStatus(id, 'review', { error: `На горячем кошельке ${fromNano(balance)} TON, не хватает для выплаты` })
    log.warn({ id }, 'не хватает средств на горячем кошельке, заявка отложена на проверку')
    return
  }

  setStatus(id, 'sending')
  let transfer: SignedTransfer
  try {
    transfer = await signTransfer(parseAddress(String(w.address)), send, comment(id))
  } catch (e) {
    // Перевод даже не подписан, деньги можно спокойно вернуть
    refund(id, 'failed', NOT_SENT)
    log.error({ id, err: String(e) }, 'вывод не подготовлен, сумма возвращена')
    return
  }
  setStatus(id, 'sending', { seqno: transfer.seqno })

  const outcome = await deliver(transfer, (err) => log.warn({ id, err }, 'ошибка отправки вывода, пробуем ещё'))
  if (outcome === 'applied') {
    const hash = await findOutgoing(comment(id)).catch(() => null)
    setStatus(id, 'sent', { tx_hash: hash ?? undefined })
    log.info({ id, amount: fromNano(send), hash }, 'вывод отправлен')
  } else if (outcome === 'expired') {
    refund(id, 'failed', NOT_SENT)
    log.error({ id }, 'сеть не приняла вывод, сумма возвращена')
  } else {
    setStatus(id, 'review', { error: 'Нет ответа от сети: проверьте по блокчейну' })
    log.warn({ id }, 'вывод не подтвердился, нужна ручная проверка')
  }
}

const NOT_SENT = 'Сеть не приняла перевод, сумма вернулась на баланс'
const RESEND_EVERY_MS = 10_000

/**
 * Отправляет перевод и ждёт, пока seqno кошелька вырастет.
 * Ошибка отправки ещё не значит, что перевод не ушёл: ответ мог потеряться. Поэтому судим только по seqno:
 * вырос — перевод применён; не вырос после validUntil — уже не применится, деньги можно вернуть.
 * Пока ждём, тот же перевод можно слать повторно: второй раз с тем же seqno кошелёк его не примет.
 */
async function deliver(transfer: SignedTransfer, onError: (err: string) => void): Promise<'applied' | 'expired' | 'unknown'> {
  let sentOk = false
  let lastTry = 0
  const deadline = (transfer.validUntil + 15) * 1000
  while (Date.now() < deadline + CONFIRM_TIMEOUT_MS) {
    if (!sentOk && Date.now() < transfer.validUntil * 1000 && Date.now() - lastTry >= RESEND_EVERY_MS) {
      lastTry = Date.now()
      try {
        await broadcast(transfer)
        sentOk = true
      } catch (e) {
        onError(String(e).slice(0, 200))
      }
    }
    await sleep(3000)
    try {
      const seqno = await hotSeqno()
      if (seqno > transfer.seqno) return 'applied'
      if (Date.now() > deadline) return 'expired'
    } catch {
      // сеть недоступна — подождём ещё
    }
  }
  return 'unknown'
}

export function userWithdrawals(userId: number, limit = 20) {
  return q('SELECT id, address, amount_nano, fee_nano, status, tx_hash, error, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit)
}

export function reviewQueue(limit = 50) {
  return q("SELECT * FROM withdrawals WHERE status = 'review' ORDER BY id LIMIT ?").all(limit)
}
