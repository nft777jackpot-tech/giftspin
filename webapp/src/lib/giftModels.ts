// Модели NFT-подарков без фона. У каждого экземпляра на Fragment есть Lottie-анимация
// из четырёх слоёв: Gift (модель), Pattern, Color Icon и Background. Оставляем только Gift,
// рисуем один кадр в прозрачную картинку и кэшируем её на устройстве.

const SIZE = 256
/** Рисуем крупнее, чем храним: после обрезки по краям модели качество не теряется. */
const RENDER = 512
const CACHE_KEY = 'gift-models:v3'
const OLD_CACHE_KEYS = ['gift-models:v1', 'gift-models:v2']
const CACHE_MAX = 90

interface LottieLayer {
  nm?: string
  refId?: string
}

interface LottieJson {
  op?: number
  layers: LottieLayer[]
  assets?: { id: string }[]
}

export interface GiftModel {
  /** slug-номер экземпляра. */
  key: string
  slug: string
  /** Хеш слоя модели: у разных номеров одной коллекции модель может совпадать. */
  hash: string
  src: string
}

type Lottie = typeof import('lottie-web/build/player/lottie_light_canvas').default
let lottiePromise: Promise<Lottie> | null = null
// Библиотека грузится, только когда модель действительно нужно нарисовать
const loadLottie = () => (lottiePromise ??= import('lottie-web/build/player/lottie_light_canvas').then((m) => m.default))

function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// Кэш в памяти читается из localStorage один раз, а не на каждый запрос
let memory: Map<string, GiftModel> | null = null

function cache(): Map<string, GiftModel> {
  if (memory) return memory
  memory = new Map()
  try {
    for (const k of OLD_CACHE_KEYS) localStorage.removeItem(k)
    const list = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    if (Array.isArray(list)) {
      for (const m of list) if (m && typeof m.key === 'string' && typeof m.src === 'string' && typeof m.hash === 'string') memory.set(m.key, m)
    }
  } catch {
    // хранилище недоступно или испорчено — начинаем с пустого кэша
  }
  return memory
}

function remember(model: GiftModel) {
  const map = cache()
  map.delete(model.key)
  map.set(model.key, model)
  // Самые старые модели вытесняются первыми
  while (map.size > CACHE_MAX) map.delete(map.keys().next().value!)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...map.values()]))
  } catch {
    // места не хватило — просто нарисуем модели заново при следующем запуске
  }
}

export const cachedModels = (): GiftModel[] => [...cache().values()]
export const cachedModel = (slug: string, num: number): GiftModel | undefined => cache().get(`${slug}-${num}`)

/** Базовая картинка коллекции без фона: запасной вариант, если модель экземпляра не нарисовалась. */
export const collectionThumb = (slug: string) => `https://fragment.com/file/gifts/${slug}/thumb.webp`

/**
 * Квадрат вокруг непрозрачной части кадра с небольшим запасом. Модели в анимациях занимают
 * разную долю кадра, после обрезки все они одного видимого размера.
 */
function cropBox(ctx: CanvasRenderingContext2D, size: number): { x: number; y: number; side: number } {
  const { data } = ctx.getImageData(0, 0, size, size)
  let minX = size
  let minY = size
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, side: size }
  const side = Math.min(size, Math.max(maxX - minX, maxY - minY) * 1.08)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { x: cx - side / 2, y: cy - side / 2, side }
}

async function renderFrame(data: LottieJson): Promise<string> {
  const lottie = await loadLottie()
  const canvas = document.createElement('canvas')
  canvas.width = RENDER
  canvas.height = RENDER
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const anim = lottie.loadAnimation<'canvas'>({
    // Контейнер намеренно не передаём: с ним рендерер создал бы свой холст размером с пустой div.
    // Типы lottie-web считают его обязательным, хотя для canvas с context он не нужен
    container: undefined as unknown as Element,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: data,
    rendererSettings: { context: ctx, clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
  })
  if (!anim.isLoaded) await new Promise<void>((res) => anim.addEventListener('DOMLoaded', () => res()))
  // Первый кадр: подарок в исходной позе, анимация начинается и заканчивается в ней
  anim.goToAndStop(0, true)
  const box = cropBox(ctx, RENDER)
  const out = document.createElement('canvas')
  out.width = SIZE
  out.height = SIZE
  out.getContext('2d')!.drawImage(canvas, box.x, box.y, box.side, box.side, 0, 0, SIZE, SIZE)
  anim.destroy()
  return out.toDataURL('image/webp', 0.9)
}

const pending = new Map<string, Promise<GiftModel | null>>()

/** Загружает и рисует модель экземпляра. null — если номера нет или формат неожиданный. */
export function loadModel(slug: string, num: number): Promise<GiftModel | null> {
  const key = `${slug}-${num}`
  const cached = cache().get(key)
  if (cached) return Promise.resolve(cached)
  // Одну и ту же модель могут попросить несколько мест сразу, рисуем её один раз
  const inFlight = pending.get(key)
  if (inFlight) return inFlight
  const job = (async () => {
    try {
      const res = await fetch(`https://nft.fragment.com/gift/${key}.lottie.json`)
      if (!res.ok) return null
      const json: LottieJson = await res.json()
      const gift = json.layers.find((l) => l.nm === 'Gift')
      if (!gift) return null
      const assets = (json.assets ?? []).filter((a) => a.id === gift.refId)
      const model: GiftModel = { key, slug, hash: fnv(JSON.stringify(assets)), src: await renderFrame({ ...json, layers: [gift], assets }) }
      remember(model)
      return model
    } catch {
      return null
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, job)
  return job
}
