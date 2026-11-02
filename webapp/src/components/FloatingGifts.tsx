import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GIFTS } from '../data/gifts'

/**
 * Объёмные NFT-подарки за интерфейсом. Экран делится на клетки, в каждой — не больше одного подарка,
 * поэтому они не налезают друг на друга и покрывают весь фон, а не только середину. Подарки медленно
 * покачиваются и поворачиваются в 3D, у каждого есть толщина. Раз в пару секунд один подарок тает
 * и появляется в другой свободной клетке уже другой моделью из любой коллекции Telegram.
 */

/** Модели коллекции: [название, хеш картинки, сколько экземпляров] — файл собирает scripts/fragment-catalog.mjs. */
type ModelRow = [string, string, number]

const CELL_W = 118
const CELL_H = 132
/** Доля клеток, где одновременно есть подарок: остальные — воздух между ними. */
const FILL = 0.62
const SWAP_MS = 2400
const FADE_MS = 900
/** Слои толщины: копии картинки чуть глубже и темнее, видны, когда подарок поворачивается боком. */
const DEPTH_LAYERS = 4

const COLLECTIONS = GIFTS.map((g) => g.id)
const modelLists = new Map<string, Promise<ModelRow[]>>()

function modelsOf(slug: string): Promise<ModelRow[]> {
  let p = modelLists.get(slug)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}models/${slug}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
    modelLists.set(slug, p)
  }
  return p
}

const shown = new Set<string>()

/** Случайная модель случайной коллекции, которую ещё не показывали. Картинка уже загружена. */
async function randomModel(): Promise<string | null> {
  for (let tries = 0; tries < 6; tries++) {
    const slug = COLLECTIONS[Math.floor(Math.random() * COLLECTIONS.length)]
    const list = await modelsOf(slug)
    if (!list.length) continue
    const [, hash] = list[Math.floor(Math.random() * list.length)]
    const src = `https://fragment.com/file/gifts/${slug}/model.${hash}.webp`
    if (shown.has(src)) continue
    const ok = await new Promise<boolean>((res) => {
      const img = new Image()
      img.onload = () => res(true)
      img.onerror = () => res(false)
      img.src = src
    })
    if (!ok) continue
    shown.add(src)
    if (shown.size > 400) shown.delete(shown.values().next().value!)
    return src
  }
  return null
}

interface Slot {
  key: number
  cell: number
  src: string
  leaving: boolean
  style: CSSProperties
}

let keySeq = 0

/** Положение и движение подарка внутри клетки: случайный сдвиг, глубина, наклоны и скорость. */
function slotStyle(cell: number, cols: number, cellW: number, cellH: number): CSSProperties {
  const col = cell % cols
  const row = Math.floor(cell / cols)
  // Дальние подарки мельче, прозрачнее и размытее
  const depth = Math.random()
  const size = Math.round(Math.min(cellW, cellH) * (0.42 + depth * 0.28))
  const room = (n: number) => Math.max(0, n - size) * (0.15 + Math.random() * 0.7)
  return {
    '--x': `${col * cellW + room(cellW)}px`,
    '--y': `${row * cellH + room(cellH)}px`,
    '--s': `${size}px`,
    '--o': (0.32 + depth * 0.4).toFixed(2),
    '--blur': `${((1 - depth) * 1.2).toFixed(2)}px`,
    '--ry': `${Math.round(18 + Math.random() * 26)}deg`,
    '--rx': `${Math.round(6 + Math.random() * 10)}deg`,
    '--bob': `${Math.round(5 + Math.random() * 7)}px`,
    '--d': `${(7 + Math.random() * 6).toFixed(1)}s`,
    '--delay': `${(-Math.random() * 10).toFixed(1)}s`,
    '--dir': Math.random() < 0.5 ? 'normal' : 'reverse',
  } as CSSProperties
}

function grid() {
  const w = window.innerWidth
  const h = window.innerHeight
  const cols = Math.max(2, Math.round(w / CELL_W))
  const rows = Math.max(3, Math.round(h / CELL_H))
  return { cols, rows, cellW: w / cols, cellH: h / rows }
}

export function FloatingGifts() {
  const [slots, setSlots] = useState<Slot[]>([])
  const layout = useRef(grid())
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const freeCell = (taken: Set<number>): number | null => {
      const { cols, rows } = layout.current
      const free = Array.from({ length: cols * rows }, (_, i) => i).filter((i) => !taken.has(i))
      return free.length ? free[Math.floor(Math.random() * free.length)] : null
    }

    const spawn = async (avoid?: number) => {
      const src = await randomModel()
      if (!alive || !src) return
      setSlots((list) => {
        const taken = new Set(list.map((s) => s.cell))
        if (avoid !== undefined) taken.add(avoid)
        const cell = freeCell(taken)
        if (cell === null) return list
        const { cols, cellW, cellH } = layout.current
        return [...list, { key: ++keySeq, cell, src, leaving: false, style: slotStyle(cell, cols, cellW, cellH) }]
      })
    }

    // Первое заполнение: часть клеток, по одной модели с небольшой паузой
    const fillUp = async () => {
      const { cols, rows } = layout.current
      const target = Math.round(cols * rows * FILL)
      for (let i = slotsRef.current.length; i < target && alive; i++) {
        await spawn()
        await new Promise((r) => setTimeout(r, 120))
      }
    }
    fillUp()

    // Смена: самый старый подарок тает, новый появляется в другой свободной клетке
    const timer = reduce
      ? 0
      : window.setInterval(() => {
          const list = slotsRef.current.filter((s) => !s.leaving)
          if (!list.length) return
          const old = list[0]
          setSlots((l) => l.map((s) => (s.key === old.key ? { ...s, leaving: true } : s)))
          window.setTimeout(() => alive && setSlots((l) => l.filter((s) => s.key !== old.key)), FADE_MS)
          spawn(old.cell)
        }, SWAP_MS)

    // Экран повернули или изменили окно — раскладываем заново
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        const next = grid()
        const prev = layout.current
        if (next.cols === prev.cols && next.rows === prev.rows) return
        layout.current = next
        setSlots([])
        fillUp()
      }, 300)
    }
    window.addEventListener('resize', onResize)

    // Лёгкий параллакс за курсором на компьютере: вся сцена чуть поворачивается
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !stageRef.current) return
      const kx = e.clientX / window.innerWidth - 0.5
      const ky = e.clientY / window.innerHeight - 0.5
      stageRef.current.style.setProperty('--px', `${(kx * 8).toFixed(2)}deg`)
      stageRef.current.style.setProperty('--py', `${(-ky * 6).toFixed(2)}deg`)
    }
    if (!reduce) window.addEventListener('pointermove', onMove)

    return () => {
      alive = false
      window.clearInterval(timer)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="float-layer" aria-hidden>
      <div className="float-stage" ref={stageRef}>
        {slots.map((s) => (
          <div key={s.key} className={`float-gift ${s.leaving ? 'is-leaving' : ''}`} style={s.style}>
            <div className="float-gift__spin">
              {Array.from({ length: DEPTH_LAYERS }, (_, i) => (
                <img key={i} className="float-gift__layer" style={{ '--z': i } as CSSProperties} src={s.src} alt="" draggable={false} />
              ))}
              <img className="float-gift__face" src={s.src} alt="" draggable={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
