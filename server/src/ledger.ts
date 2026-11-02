// Игроки и их баланс. Любое изменение баланса проходит через applyLedger и оставляет запись в журнале
import { randomBytes } from 'node:crypto'
import { fromNano } from '@ton/core'
import { config } from './config.ts'
import { q, transaction } from './db.ts'

export interface User {
  id: number
  name: string
  username: string | null
  /** Код в комментарии к переводу: по нему депозит находит игрока. */
  memo: string
  balance: bigint
  /** Отыгрыш: сколько ещё нужно поставить, прежде чем откроется вывод. */
  wagerLeft: bigint
}

export type LedgerKind = 'deposit' | 'withdraw' | 'withdraw_refund' | 'bet' | 'win' | 'refund' | 'bonus' | 'gift_deposit' | 'gift_sell'

/** Эти зачисления нужно отыграть перед выводом: пополнения TON и подарком, награды за задания и промокоды. */
const MUST_WAGER: LedgerKind[] = ['deposit', 'gift_deposit', 'bonus']

export class LedgerError extends Error {}

// Без похожих символов 0/O и 1/I, чтобы код было легко переписать вручную
const MEMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newMemo(): string {
  const bytes = randomBytes(8)
  return 'GS' + [...bytes].map((b) => MEMO_ALPHABET[b % MEMO_ALPHABET.length]).join('')
}

function toUser(row: Record<string, unknown> | undefined): User | null {
  if (!row) return null
  return {
    id: Number(row.id),
    name: String(row.name),
    username: (row.username as string | null) ?? null,
    memo: String(row.memo),
    balance: row.balance_nano as bigint,
    wagerLeft: row.wager_left_nano as bigint,
  }
}

export function getUser(id: number): User | null {
  return toUser(q('SELECT * FROM users WHERE id = ?').get(id))
}

export function findUserByMemo(memo: string): User | null {
  return toUser(q('SELECT * FROM users WHERE memo = ?').get(memo))
}

/** Создаёт игрока при первом входе и обновляет имя при следующих. */
export function ensureUser(id: number, name: string, username: string | null): User {
  const existing = getUser(id)
  if (existing) {
    if (existing.name !== name || existing.username !== username) {
      q('UPDATE users SET name = ?, username = ? WHERE id = ?').run(name, username, id)
    }
    return { ...existing, name, username }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      q('INSERT INTO users (id, name, username, memo, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, username, newMemo(), Date.now())
      return getUser(id)!
    } catch (e) {
      // Совпал код с чужим — пробуем другой
      if (!String(e).includes('UNIQUE')) throw e
    }
  }
  throw new Error('Не удалось выдать уникальный код депозита')
}

/**
 * Меняет баланс на amount (отрицательный — списание) и пишет запись в журнал.
 * Вызывать внутри transaction вместе с остальными изменениями той же операции.
 */
export function applyLedger(userId: number, kind: LedgerKind, amount: bigint, ref: string | null): bigint {
  const row = q('UPDATE users SET balance_nano = balance_nano + ? WHERE id = ? AND balance_nano + ? >= 0 RETURNING balance_nano').get(amount, userId, amount)
  if (!row) throw new LedgerError('Недостаточно средств')
  const balance = row.balance_nano as bigint
  // Отыгрыш считается здесь, поэтому его не обойти: любое зачисление из списка добавляет долг, любая ставка уменьшает
  if (MUST_WAGER.includes(kind) && amount > 0) {
    q('UPDATE users SET wager_left_nano = wager_left_nano + ? WHERE id = ?').run((amount * BigInt(Math.round(config.wagerMult * 100))) / 100n, userId)
  } else if (kind === 'bet') {
    q('UPDATE users SET wager_left_nano = MAX(0, wager_left_nano + ?) WHERE id = ?').run(amount, userId)
  }
  q('INSERT INTO ledger (user_id, kind, amount_nano, balance_after, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, kind, amount, balance, ref, Date.now())
  return balance
}

export const wagerLeft = (userId: number) => q('SELECT wager_left_nano FROM users WHERE id = ?').get(userId)!.wager_left_nano as bigint

/** Ставку отменили или вернули: то, что она закрыла в отыгрыше, снова нужно поставить. Иначе долг закрывался бы без риска. */
export function restoreWager(userId: number, nano: bigint) {
  if (nano > 0n) q('UPDATE users SET wager_left_nano = wager_left_nano + ? WHERE id = ?').run(nano, userId)
}

/** Вывод TON и подарков открыт, только когда всё отыграно. */
export function requireWagered(userId: number) {
  const left = wagerLeft(userId)
  if (left > 0n) throw new LedgerError(`Вывод откроется после отыгрыша: осталось поставить ${fromNano(left)} TON`)
}

export function changeBalance(userId: number, kind: LedgerKind, amount: bigint, ref: string | null): bigint {
  return transaction(() => applyLedger(userId, kind, amount, ref))
}

export function history(userId: number, limit = 50) {
  return q('SELECT kind, amount_nano, balance_after, ref, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit)
}
