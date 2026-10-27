// Provably fair на сервере. Формула та же, что проверяет сайт (webapp/src/lib/verify.ts):
// числа из HMAC-SHA256(серверный сид, `клиентский сид:номер ставки:курсор`). Сервер держит серверный сид
// в секрете, показывает его хеш до ставки и раскрывает сид при смене пары — тогда любой может всё пересчитать.
import { createHash, createHmac, randomBytes } from 'node:crypto'

export const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

export const randomSeed = (bytes = 32) => randomBytes(bytes).toString('hex')

/** Числа из [0, 1): по 4 байта HMAC на число, каждый курсор даёт ещё 8 чисел. */
export function fairFloats(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const out: number[] = []
  for (let cursor = 0; out.length < count; cursor++) {
    const bytes = createHmac('sha256', Buffer.from(serverSeed, 'utf8')).update(`${clientSeed}:${nonce}:${cursor}`, 'utf8').digest()
    for (let i = 0; i + 4 <= bytes.length && out.length < count; i += 4) {
      out.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return out
}
