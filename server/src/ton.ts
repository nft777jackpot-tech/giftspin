// Горячий кошелёк проекта и чтение блокчейна через toncenter
import { Address, beginCell, type Cell, external, internal, SendMode, storeMessage, type Transaction } from '@ton/core'
import { mnemonicToPrivateKey, type KeyPair } from '@ton/crypto'
import { TonClient, WalletContractV4 } from '@ton/ton'
import { config, IS_TESTNET } from './config.ts'

type HttpAdapter = NonNullable<ConstructorParameters<typeof TonClient>[0]['httpAdapter']>

// toncenter без ключа пускает 1 запрос в секунду, с ключом — 10. Иначе отвечает 429.
// Все запросы к нему идут по очереди с паузой, а 429 повторяется
const GAP_MS = config.toncenter.apiKey ? 120 : 1100
const RETRIES_429 = 5

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let queue: Promise<void> = Promise.resolve()
let lastAt = 0

function nextSlot(): Promise<void> {
  const slot = queue.then(async () => {
    const wait = lastAt + GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastAt = Date.now()
  })
  queue = slot
  return slot
}

const throttledFetch: HttpAdapter = async (req) => {
  const headers = Object.fromEntries(Object.entries(req.headers.toJSON()).map(([k, v]) => [k, String(v)]))
  for (let attempt = 0; ; attempt++) {
    await nextSlot()
    const res = await fetch(req.url!, {
      method: (req.method ?? 'post').toUpperCase(),
      headers,
      body: req.data,
      signal: req.timeout ? AbortSignal.timeout(req.timeout) : undefined,
    })
    if (res.status === 429 && attempt < RETRIES_429) {
      await sleep(GAP_MS * (attempt + 1))
      continue
    }
    const text = await res.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      // не JSON — отдадим как есть, TonClient сам сообщит об ошибке
    }
    return { data, status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers), config: req, request: null }
  }
}

export const client = new TonClient({ ...config.toncenter, httpAdapter: throttledFetch })

let keyPair: KeyPair | null = null
let wallet: WalletContractV4 | null = null

export async function initWallet() {
  if (config.mnemonic.length !== 24) {
    throw new Error('WALLET_MNEMONIC не задан или неполный. Создайте кошелёк командой: npm run wallet:new')
  }
  keyPair = await mnemonicToPrivateKey(config.mnemonic)
  wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey })
}

function hot(): { wallet: WalletContractV4; keyPair: KeyPair } {
  if (!wallet || !keyPair) throw new Error('Кошелёк не инициализирован')
  return { wallet, keyPair }
}

/** Адрес в удобном виде: для testnet с пометкой тестовой сети, без отскока, чтобы переводы на новый кошелёк не возвращались. */
export function friendly(address: Address): string {
  return address.toString({ testOnly: IS_TESTNET, bounceable: false })
}

export const hotAddress = () => hot().wallet.address

export async function hotBalance(): Promise<bigint> {
  return client.getBalance(hotAddress())
}

export async function hotSeqno(): Promise<number> {
  return client.open(hot().wallet).getSeqno()
}

/** Тело перевода с текстовым комментарием в base64: так его ждёт TON Connect. */
export function commentPayload(text: string): string {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64')
}

export function readComment(body: Cell | undefined | null): string | null {
  if (!body) return null
  try {
    const s = body.beginParse()
    if (s.remainingBits < 32 || s.loadUint(32) !== 0) return null
    return s.loadStringTail()
  } catch {
    return null
  }
}

/** Сколько секунд подписанный перевод действует. После этого сеть его не примет. */
export const TRANSFER_TTL_S = 60

export interface SignedTransfer {
  seqno: number
  /** Unix-время в секундах, после которого перевод уже не применится. */
  validUntil: number
  boc: Buffer
}

/** Подписывает перевод с горячего кошелька. Повторная отправка того же перевода безопасна: кошелёк примет seqno только один раз. */
export async function signTransfer(to: Address, amount: bigint, comment: string): Promise<SignedTransfer> {
  const { wallet: w, keyPair: kp } = hot()
  const seqno = await hotSeqno()
  const validUntil = Math.floor(Date.now() / 1000) + TRANSFER_TTL_S
  const body = w.createTransfer({
    seqno,
    secretKey: kp.secretKey,
    timeout: validUntil,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to, value: amount, body: comment, bounce: false })],
  })
  // Пока кошелёк не развёрнут (seqno 0), первый перевод несёт его код
  const message = external({ to: w.address, init: seqno === 0 ? w.init : undefined, body })
  return { seqno, validUntil, boc: beginCell().store(storeMessage(message)).endCell().toBoc() }
}

export async function broadcast(transfer: SignedTransfer) {
  await client.sendFile(transfer.boc)
}

export interface Incoming {
  hash: string
  lt: bigint
  amount: bigint
  sender: string | null
  comment: string | null
  bounced: boolean
}

function toIncoming(tx: Transaction): Incoming | null {
  const msg = tx.inMessage
  if (!msg || msg.info.type !== 'internal') return null
  return {
    hash: tx.hash().toString('hex'),
    lt: tx.lt,
    amount: msg.info.value.coins,
    sender: friendly(msg.info.src),
    comment: readComment(msg.body),
    bounced: msg.info.bounced,
  }
}

/** Входящие переводы на кошелёк проекта новее afterLt, от старых к новым. Листает страницы, пока не дойдёт до afterLt. */
export async function incomingAfter(afterLt: bigint, maxPages = 10): Promise<Incoming[]> {
  const address = hotAddress()
  const found: Incoming[] = []
  let cursor: { lt: string; hash: string } | undefined
  for (let page = 0; page < maxPages; page++) {
    const txs = await client.getTransactions(address, { limit: 30, archival: false, ...(cursor ?? {}), inclusive: false })
    if (!txs.length) break
    let reached = false
    for (const tx of txs) {
      if (tx.lt <= afterLt) {
        reached = true
        break
      }
      const inc = toIncoming(tx)
      if (inc) found.push(inc)
    }
    const last = txs[txs.length - 1]
    if (reached || txs.length < 30) break
    cursor = { lt: last.lt.toString(), hash: last.hash().toString('base64') }
  }
  return found.reverse()
}

/** Хеш исходящей транзакции кошелька с данным комментарием среди последних. */
export async function findOutgoing(comment: string): Promise<string | null> {
  const txs = await client.getTransactions(hotAddress(), { limit: 20, archival: false })
  for (const tx of txs) {
    for (const out of tx.outMessages.values()) {
      if (out.info.type === 'internal' && readComment(out.body) === comment) return tx.hash().toString('hex')
    }
  }
  return null
}

export function parseAddress(text: string): Address {
  return Address.parse(text.trim())
}
