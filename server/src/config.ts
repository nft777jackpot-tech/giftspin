import { toNano } from '@ton/core'
import { fileURLToPath } from 'node:url'

const env = process.env

export type Network = 'testnet' | 'mainnet'
export const NETWORK: Network = env.TON_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
export const IS_TESTNET = NETWORK === 'testnet'

const ton = (name: string, fallback: string) => toNano(env[name]?.trim() || fallback)

/**
 * Склад подарков. telegram — аккаунт в бизнес-режиме, к которому подключён бот; fake — тестовый список
 * из fixtures/stock.json, только в testnet; off — склада нет. По умолчанию telegram, если задан токен бота.
 */
export type WarehouseMode = 'telegram' | 'fake' | 'off'
const warehouseEnv = env.WAREHOUSE?.trim() || (env.BOT_TOKEN?.trim() ? 'telegram' : 'off')
const WAREHOUSE: WarehouseMode = warehouseEnv === 'fake' ? (IS_TESTNET ? 'fake' : 'off') : warehouseEnv === 'telegram' ? 'telegram' : 'off'

export const config = {
  port: Number(env.PORT) || 8787,
  // Только локальный адрес: наружу сервер смотрит через прокси или хостинг, а не напрямую
  host: '127.0.0.1',
  dbPath: env.DB_PATH || fileURLToPath(new URL('../data/giftspin.sqlite', import.meta.url)),
  toncenter: {
    endpoint: IS_TESTNET ? 'https://testnet.toncenter.com/api/v2/jsonRPC' : 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: env.TONCENTER_API_KEY?.trim() || undefined,
  },
  mnemonic: env.WALLET_MNEMONIC?.trim().split(/\s+/).filter(Boolean) ?? [],
  botToken: env.BOT_TOKEN?.trim() ?? '',
  devAuth: env.DEV_AUTH === '1' && IS_TESTNET,
  adminToken: env.ADMIN_TOKEN?.trim() ?? '',
  trustClientGames: env.TRUST_CLIENT_GAMES === '1' && IS_TESTNET,
  minDeposit: ton('MIN_DEPOSIT_TON', '0.1'),
  minWithdraw: ton('MIN_WITHDRAW_TON', '0.5'),
  maxWithdraw: ton('MAX_WITHDRAW_TON', '50'),
  reviewOver: ton('REVIEW_OVER_TON', '10'),
  dailyWithdraw: ton('DAILY_WITHDRAW_TON', '100'),
  withdrawFee: ton('WITHDRAW_FEE_TON', '0.05'),
  /** Остаток на горячем кошельке, который не тратим на выплаты: из него платится газ. */
  gasReserve: toNano('0.2'),
  depositPollMs: 10_000,
  withdrawPollMs: 5_000,
  warehouse: WAREHOUSE,
  stockSyncMs: 5 * 60_000,
}

/** Идентификатор сети для TON Connect: кошелёк откажется подписывать перевод в другой сети. */
export const TON_CONNECT_CHAIN = IS_TESTNET ? '-3' : '-239'
