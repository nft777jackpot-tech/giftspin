// Фейковые игроки для демо-лент и раундов, пока нет бэкенда
export const NAMES = [
  'alex_ton', 'Мария', 'kirill.eth', 'Dmitry', 'nastya_s', 'Pavel', 'tonwhale', 'Ксюша',
  'max_crypto', 'Артём', 'ivan777', 'Lena', 'giftlord', 'Олег', 'sasha_k', 'Vlad', 'frogfan',
  'Никита', 'pepe_hunter', 'Аня', 'carlos_ton', 'Ayşe', 'joao.gifts', 'mehmet', 'lucia', 'Pedro', 'emre_x',
]

export const COLORS = ['#3fa9ff', '#9b6bff', '#ff5fa8', '#ffc542', '#22d68a', '#ff7a45', '#4dd6e8', '#c86bff']

export interface FakePlayer {
  id: string
  name: string
  color: string
}

let seq = 0

export function randomPlayer(): FakePlayer {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)]
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  return { id: `p${++seq}`, name, color }
}

export function playerColor(index: number): string {
  return COLORS[index % COLORS.length]
}

/** Детерминированный генератор: одни и те же демо-данные при каждом запуске. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
