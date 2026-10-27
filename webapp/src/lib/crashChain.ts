// Публичная история краша на цепочке хешей: сид каждого раунда — SHA-256 сида следующего.
// Сервер генерирует цепочку заранее и публикует её последний хеш, поэтому подменить
// исход будущего раунда нельзя, а любой прошлый раунд проверяется по раскрытому сиду.
import { roundFloats, sha256Hex } from './fair'
import { crashPoint } from './rtp'

const CHAIN_LEN = 600
const PLAYED_AT_START = 40

export interface CrashRound {
  id: number
  seed: string
  /** SHA-256 сида. Совпадает с сидом предыдущего раунда. */
  hash: string
  point: number
  at: number
}

export function crashFromSeed(seed: string): number {
  return crashPoint(undefined, roundFloats(seed, 1)[0])
}

const chain: string[] = [sha256Hex(`demo-${Math.random()}`)]
for (let i = 1; i < CHAIN_LEN; i++) chain.push(sha256Hex(chain[i - 1]))

// Раунды идут с конца цепочки к началу
let cursor = CHAIN_LEN - 1
let nextId = 1_204_000
const history: CrashRound[] = []

function play(at: number): CrashRound {
  const seed = chain[cursor--]
  const round = { id: nextId++, seed, hash: sha256Hex(seed), point: crashFromSeed(seed), at }
  history.unshift(round)
  if (history.length > 200) history.pop()
  return round
}

for (let i = PLAYED_AT_START; i > 0; i--) play(Date.now() - i * 15000)

/** Хеш финального звена, который публикуется до начала всех игр. */
export const CHAIN_TERMINAL = sha256Hex(chain[CHAIN_LEN - 1])

export const crashHistory = (): readonly CrashRound[] => history

/** Хеш и номер следующего раунда — известны до его начала. */
export function nextCrash(): { id: number; hash: string } {
  return { id: nextId, hash: sha256Hex(chain[cursor]) }
}

export function playCrash(): CrashRound {
  if (cursor < 0) throw new Error('Crash chain exhausted')
  return play(Date.now())
}
