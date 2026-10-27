// Provably fair: исход считается из HMAC-SHA256(серверный сид, «клиентский сид:номер ставки:курсор»).
// Хеш серверного сида показывается до ставки, сам сид раскрывается при смене пары.
// SHA-256 написан синхронно, чтобы игры не ждали Web Crypto перед анимацией.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
const enc = new TextEncoder()

function sha256(data: Uint8Array): Uint8Array {
  const len = data.length
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6)
  padded.set(data)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(len / 0x20000000))
  dv.setUint32(padded.length - 4, (len << 3) >>> 0)

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15]
      const b = W[i - 2]
      W[i] = W[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + W[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    H[0] += a
    H[1] += b
    H[2] += c
    H[3] += d
    H[4] += e
    H[5] += f
    H[6] += g
    H[7] += h
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i])
  return out
}

function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = new Uint8Array(64)
  k.set(key.length > 64 ? sha256(key) : key)
  const inner = new Uint8Array(64 + msg.length)
  const outer = new Uint8Array(64 + 32)
  for (let i = 0; i < 64; i++) {
    inner[i] = k[i] ^ 0x36
    outer[i] = k[i] ^ 0x5c
  }
  inner.set(msg, 64)
  outer.set(sha256(inner), 64)
  return sha256(outer)
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

export const sha256Hex = (text: string) => hex(sha256(enc.encode(text)))
export const hmacHex = (key: string, msg: string) => hex(hmacSha256(enc.encode(key), enc.encode(msg)))

export function randomSeed(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** Числа из [0, 1): по 4 байта HMAC на число, каждый курсор даёт ещё 8 чисел. */
export function fairFloats(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const out: number[] = []
  const key = enc.encode(serverSeed)
  for (let cursor = 0; out.length < count; cursor++) {
    const bytes = hmacSha256(key, enc.encode(`${clientSeed}:${nonce}:${cursor}`))
    for (let i = 0; i + 4 <= bytes.length && out.length < count; i += 4) {
      out.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return out
}

/**
 * Соль общих раундов (краш, рулетка, PvP). В бою это хеш блока TON, объявленного заранее,
 * чтобы сервер не мог подобрать сид под нужный исход.
 */
export const ROUND_SALT = 'giftspin-public-salt'

export const roundFloats = (seed: string, count: number) => fairFloats(seed, ROUND_SALT, 0, count)

export interface RoundSeed {
  seed: string
  hash: string
}

/** Сид общего раунда: хеш показывается до начала, сид после. */
export function newRound(): RoundSeed {
  const seed = randomSeed()
  return { seed, hash: sha256Hex(seed) }
}
