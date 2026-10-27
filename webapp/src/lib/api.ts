// Запросы к серверу с кошельком проекта. В Telegram авторизуемся подписанной initData,
// в обычном браузере — тестовым игроком (сервер пускает его только в testnet)
import { tg } from './telegram'

export class ApiError extends Error {}

/**
 * Адрес сервера. По умолчанию /api на том же адресе, что и сайт. Пустая строка — сервера нет,
 * например на GitHub Pages: сайт сразу работает в демо и не шлёт запросов в пустоту.
 */
const API_URL: string = import.meta.env.VITE_API_URL ?? '/api'

function authHeaders(): Record<string, string> {
  if (tg?.initData) return { Authorization: `tma ${tg.initData}` }
  return { 'x-dev-user': '1' }
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  if (!API_URL) throw new ApiError('Сервер не подключён')
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...authHeaders() },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Ошибка сервера ${res.status}`)
  return data as T
}

export interface ServerMe {
  id: number
  name: string
  memo: string
  /** Баланс TON строкой, точно до нанотона. */
  balance: string
  network: 'testnet' | 'mainnet'
  depositAddress: string
  trustClientGames: boolean
  /** Игры, которые считает сервер (их исход клиент не подделает). */
  serverGames: string[]
  limits: { minDeposit: string; minWithdraw: string; maxWithdraw: string; withdrawFee: string; reviewOver: string }
}

/** Результат одиночной игры с сервера. Доп. поля зависят от игры: дайс — roll, плинко — path и slot. */
export interface ServerPlay {
  multiplier: number
  payout: string
  balance: string
  result: string
  win: boolean
  proof: { hash: string; clientSeed: string; nonce: number }
  roll?: number
  path?: boolean[]
  slot?: number
}

export interface FairInfo {
  hash: string
  clientSeed: string
  nonce: number
  revealed: { hash: string; serverSeed: string; clientSeed: string; nonce: number }[]
}

export interface DepositInfo {
  address: string
  memo: string
  /** Комментарий с кодом игрока, уже упакованный для TON Connect. */
  payload: string
  chain: '-3' | '-239'
  minDeposit: string
  deposits: { hash: string; amount: string; status: string; at: number }[]
}

export interface Withdrawal {
  id: number
  address: string
  amount: string
  fee: string
  status: 'queued' | 'review' | 'sending' | 'sent' | 'failed' | 'rejected'
  hash: string | null
  error: string | null
  at: number
}

/** Перевод TON в нанотоны строкой: так сумму ждёт TON Connect. */
export function toNanoString(ton: number): string {
  const [int, frac = ''] = ton.toFixed(9).split('.')
  return (BigInt(int) * 1_000_000_000n + BigInt(frac.padEnd(9, '0'))).toString()
}

/** Склад подарков и витрина: коллекции, которые лежат на складе, свободны и с ценой. */
export interface StockInfo {
  mode: 'telegram' | 'fake' | 'off'
  connected: boolean
  /** username аккаунта-склада: на него игроки отправляют подарки. */
  account: string | null
  gifts: { slug: string; name: string; count: number; num: number; price: string }[]
}

/** Подарок игрока на складе. reserved — в инвентаре, withdrawing и transferring — выводится, sent — передан. */
export interface ServerGift {
  id: string
  slug: string
  num: number
  name: string
  model: string | null
  backdrop: string | null
  price: string | null
  status: 'reserved' | 'withdrawing' | 'transferring' | 'sent'
  error: string | null
}

/** Ссылка на перевод ton://transfer: кошелёк по ней сам подставит адрес, сумму и комментарий. */
export function transferLink(address: string, memo: string, amountTon: number): string {
  const amount = amountTon > 0 ? `amount=${toNanoString(amountTon)}&` : ''
  return `ton://transfer/${address}?${amount}text=${encodeURIComponent(memo)}`
}

/** Ссылка на транзакцию в обозревателе tonviewer. */
export function explorerTx(hash: string, network: ServerMe['network']): string {
  return `https://${network === 'testnet' ? 'testnet.' : ''}tonviewer.com/transaction/${hash}`
}
