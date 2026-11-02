import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { config } from './config.ts'

mkdirSync(dirname(config.dbPath), { recursive: true })

export const db = new DatabaseSync(config.dbPath)

// Суммы хранятся в нанотонах целыми числами. Баланс не может уйти в минус: это проверяет сама база
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    memo TEXT NOT NULL UNIQUE,
    balance_nano INTEGER NOT NULL DEFAULT 0 CHECK (balance_nano >= 0),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    amount_nano INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    ref TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ledger_by_user ON ledger(user_id, id);

  CREATE TABLE IF NOT EXISTS deposits (
    tx_hash TEXT PRIMARY KEY,
    lt TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    amount_nano INTEGER NOT NULL,
    comment TEXT,
    sender TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    address TEXT NOT NULL,
    amount_nano INTEGER NOT NULL,
    fee_nano INTEGER NOT NULL,
    status TEXT NOT NULL,
    seqno INTEGER,
    tx_hash TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS withdrawals_by_status ON withdrawals(status, id);

  -- Склад: каждый NFT-подарок на аккаунте-складе, id — owned_gift_id из Telegram.
  -- status: free — можно выиграть; reserved — у игрока в инвентаре; withdrawing — игрок просит вывести, ждёт проверки;
  -- transferring — бот передаёт его сейчас; sent — передан игроку; gone — пропал со склада
  CREATE TABLE IF NOT EXISTS stock (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    num INTEGER NOT NULL,
    title TEXT NOT NULL,
    model TEXT,
    backdrop TEXT,
    symbol TEXT,
    can_transfer INTEGER NOT NULL DEFAULT 0,
    transfer_stars INTEGER NOT NULL DEFAULT 0,
    transfer_after INTEGER,
    status TEXT NOT NULL DEFAULT 'free',
    user_id INTEGER REFERENCES users(id),
    deposited_by INTEGER REFERENCES users(id),
    credited INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stock_by_status ON stock(status, slug);
  CREATE INDEX IF NOT EXISTS stock_by_user ON stock(user_id, status);

  -- Цена коллекции в нанотонах: Telegram её не сообщает, её задаёт администратор
  CREATE TABLE IF NOT EXISTS gift_prices (
    slug TEXT PRIMARY KEY,
    price_nano INTEGER NOT NULL CHECK (price_nano > 0),
    updated_at INTEGER NOT NULL
  );

  -- Сиды честной игры игрока: сервер держит server_seed в секрете, показывает server_hash, раскрывает при смене пары
  CREATE TABLE IF NOT EXISTS game_seeds (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    server_seed TEXT NOT NULL,
    server_hash TEXT NOT NULL,
    client_seed TEXT NOT NULL,
    nonce INTEGER NOT NULL DEFAULT 0
  );

  -- Раскрытые пары: по ним любой может пересчитать прошлые ставки
  CREATE TABLE IF NOT EXISTS revealed_seeds (
    server_hash TEXT PRIMARY KEY,
    server_seed TEXT NOT NULL,
    client_seed TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    user_id INTEGER,
    revealed_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Общие раунды краша: хеш сида показывается до ставок, сам сид — после взрыва
  CREATE TABLE IF NOT EXISTS crash_rounds (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL,
    seed TEXT NOT NULL,
    point REAL NOT NULL,
    started_at INTEGER,
    crashed_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open'
  );

  -- Общая рулетка: номер раунда — номер интервала по часам сервера
  CREATE TABLE IF NOT EXISTS roulette_rounds (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL,
    seed TEXT NOT NULL,
    cell INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
  );

  CREATE TABLE IF NOT EXISTS roulette_bets (
    round_id INTEGER NOT NULL REFERENCES roulette_rounds(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    color TEXT NOT NULL,
    amount_nano INTEGER NOT NULL,
    payout_nano INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (round_id, user_id, color)
  );

  CREATE TABLE IF NOT EXISTS crash_bets (
    round_id INTEGER NOT NULL REFERENCES crash_rounds(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_nano INTEGER NOT NULL,
    auto REAL,
    cashed REAL,
    payout_nano INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (round_id, user_id)
  );
`)

/** Запрос, который читает целые числа как bigint: суммы в нанотонах не теряют точность. */
export function q(sql: string) {
  const stmt = db.prepare(sql)
  stmt.setReadBigInts(true)
  return stmt
}

export type Row = Record<string, SQLInputValue>

let depth = 0

/**
 * Всё внутри выполняется целиком или не выполняется вовсе. Вложенный вызов становится точкой сохранения
 * внутри внешней транзакции: так, например, выигрыш подарка можно выдать прямо из игры.
 */
export function transaction<T>(fn: () => T): T {
  const sp = depth > 0 ? `sp${depth}` : null
  db.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE')
  depth++
  try {
    const result = fn()
    depth--
    db.exec(sp ? `RELEASE ${sp}` : 'COMMIT')
    return result
  } catch (e) {
    depth--
    db.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK')
    throw e
  }
}

export const kv = {
  get: (key: string): string | null => (q('SELECT value FROM kv WHERE key = ?').get(key)?.value as string | undefined) ?? null,
  set: (key: string, value: string) => q('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
}
