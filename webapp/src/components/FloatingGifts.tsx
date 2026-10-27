import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cachedModels, loadModel, type GiftModel } from '../lib/giftModels'

const SLOTS = 12
/** Сколько разных моделей держим в ротации: чем больше пул, тем реже повторы. */
const POOL_TARGET = 36
// Номера до 800 есть почти во всех коллекциях, отсутствующие просто пропускаются
const MAX_NUM = 800

const COLLECTIONS = [
  'plushpepe', 'heartlocket', 'durovscap', 'preciouspeach', 'mightyarm', 'astralshard', 'lootbag', 'scaredcat',
  'magicpotion', 'genielamp', 'lowrider', 'swisswatch', 'kissedfrog', 'signetring', 'nekohelmet', 'vintagecigar',
  'toybear', 'eternalrose', 'diamondring', 'lovepotion', 'tophat', 'crystalball', 'sakuraflower', 'jellybunny',
  'witchhat', 'hexpot', 'spyagaric', 'skullflower',
]

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function slotStyle(i: number): CSSProperties {
  // Мелкие подарки дальше: прозрачнее, размытее и медленнее
  const depth = Math.random()
  const size = 40 + depth * 52
  const duration = 34 - depth * 14 + Math.random() * 6
  return {
    '--x': `${(i / SLOTS) * 100 + Math.random() * 6 - 3}%`,
    '--s': `${size}px`,
    '--o': 0.12 + depth * 0.18,
    '--blur': `${(1 - depth) * 2.5}px`,
    '--d': `${duration}s`,
    '--delay': `${-Math.random() * duration}s`,
    '--dx': `${(Math.random() - 0.5) * 120}px`,
    '--r0': `${(Math.random() - 0.5) * 40}deg`,
    '--r1': `${(Math.random() - 0.5) * 120}deg`,
  } as CSSProperties
}

/**
 * Подарки разных моделей медленно всплывают за интерфейсом. Модель меняется, когда подарок
 * уходит за верх экрана, и берётся из пула по кругу, поэтому повтор бывает только после
 * того, как показан весь пул. Слой не ловит касания и лежит между фоном и контентом.
 */
export function FloatingGifts() {
  const styles = useMemo(() => Array.from({ length: SLOTS }, (_, i) => slotStyle(i)), [])
  const [slots, setSlots] = useState<(GiftModel | null)[]>(() => Array(SLOTS).fill(null))
  const pool = useRef<GiftModel[]>([])
  const queue = useRef<GiftModel[]>([])
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  /** Следующая модель по кругу, которой сейчас нет на экране и которая не из той же коллекции, что соседи. */
  const next = (exclude: (GiftModel | null)[]): GiftModel | null => {
    const onScreen = new Set(exclude.filter(Boolean).map((m) => m!.hash))
    for (let tries = 0; tries < pool.current.length * 2; tries++) {
      if (!queue.current.length) queue.current = shuffle(pool.current)
      const m = queue.current.shift()!
      if (!onScreen.has(m.hash)) return m
    }
    return pool.current[0] ?? null
  }

  const addToPool = (m: GiftModel) => {
    if (pool.current.some((x) => x.hash === m.hash)) return
    pool.current.push(m)
    queue.current.push(m)
    // Пустые места заполняем сразу, как только появилась новая модель
    setSlots((list) => {
      const i = list.indexOf(null)
      if (i < 0) return list
      const copy = [...list]
      copy[i] = next(copy)
      return copy
    })
  }

  useEffect(() => {
    let alive = true
    cachedModels().forEach(addToPool)

    // Кандидаты идут по кругу через перемешанные коллекции, так рядом не оказываются одинаковые
    const run = async () => {
      let order = shuffle(COLLECTIONS)
      let k = 0
      let misses = 0
      while (alive && pool.current.length < POOL_TARGET && misses < 40) {
        if (k >= order.length) {
          order = shuffle(COLLECTIONS)
          k = 0
        }
        const slug = order[k++]
        const model = await loadModel(slug, 1 + Math.floor(Math.random() * MAX_NUM))
        if (!alive) return
        if (model && !pool.current.some((x) => x.hash === model.hash)) addToPool(model)
        else misses++
        // Пауза между моделями, чтобы отрисовка не мешала интерфейсу
        await new Promise((r) => setTimeout(r, pool.current.length < SLOTS ? 50 : 600))
      }
    }
    run()
    return () => {
      alive = false
    }
    // Пул собирается один раз за время жизни слоя
  }, [])

  const swap = (i: number) => {
    setSlots((list) => {
      const copy = [...list]
      copy[i] = next(copy.filter((_, k) => k !== i)) ?? copy[i]
      return copy
    })
  }

  return (
    <div className="float-layer" aria-hidden>
      {slots.map((m, i) => (
        <img
          key={i}
          className={`float-gift ${m ? '' : 'is-empty'}`}
          style={styles[i]}
          src={m?.src}
          alt=""
          draggable={false}
          // Подарок ушёл за верх экрана — следующий круг он пролетит другой моделью
          onAnimationIteration={() => swap(i)}
        />
      ))}
    </div>
  )
}
