import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { BetInput } from '../components/BetInput'
import { TonIcon } from '../components/icons'
import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { api } from '../lib/api'
import { demoSnap, flightMs, GROWTH, WAIT_MS, type CrashBetView, type CrashPhase, type CrashSnap } from '../lib/crashRounds'
import { fmtAmount, fmtMult } from '../lib/format'
import { t, tk } from '../lib/i18n'
import { onLive, rejoinRoom, serverNow, useLive } from '../lib/live'
import { haptic } from '../lib/telegram'
import { useStore } from '../state/store'

type Phase = CrashPhase

interface MyBet {
  amount: number
  cashed?: number
}

/** Всплывающее сообщение о результате ставки поверх поля. */
interface Notice {
  id: number
  win: boolean
  mult: number
  /** Выплата при выигрыше или сгоревшая ставка, в TON. */
  amount: number
}

const NOTICE_MS = 2800
let noticeSeq = 0

/** Рубежи множителя: на каждом своя вспышка, а эффекты полёта нарастают. */
const MILESTONES = [2, 5, 10, 50, 100]
const MILESTONE_COLOR = ['#8cffe1', '#b36bff', '#ffb347', '#ff5f7a', '#ffd75e']
const MILESTONE_TEXT = [tk('Похищение!'), tk('Мегатарелка!'), tk('Планетный шторм!'), tk('Турбулентность!'), tk('Чёрная дыра!')]

interface Planet {
  x: number
  y: number
  r: number
  vx: number
  c1: string
  c2: string
  ring: boolean
  tilt: number
  /** Масштаб: уменьшается, когда планету затягивает в чёрную дыру. */
  s: number
}

const PLANET_COLORS: [string, string][] = [
  ['#ffc58a', '#c4512b'],
  ['#9fe3ff', '#2563c9'],
  ['#d6b3ff', '#6b3fc4'],
  ['#b8ffcf', '#1f8f5c'],
  ['#ffd1e8', '#c23d7e'],
  ['#fff1b8', '#b8860b'],
]

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const easeOutBack = (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
}

interface Star {
  x: number
  y: number
  r: number
  depth: number
  phase: number
}

function multTone(m: number) {
  if (m >= 10) return 'gold'
  if (m >= 2) return 'blue'
  return 'grey'
}

/** Ключ повторной отправки: если ответ на ставку потерялся, повтор с тем же ключом не спишет второй раз. */
const newKey = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const AVATAR_COLORS = ['#2ea7ff', '#7b5cff', '#ff5fa8', '#22d68a', '#ffc542', '#ff8a4d', '#4dd6e8']
const colorOf = (uid: number) => AVATAR_COLORS[Math.abs(uid) % AVATAR_COLORS.length]

const EMPTY_SNAP: CrashSnap = { id: 0, phase: 'waiting', startAt: 0, point: null, hash: '', seed: null, bets: [], history: [] }

/** Снимок раунда с сервера: время сервера переводим в часы устройства. */
function fromServer(msg: Record<string, unknown>): CrashSnap {
  const shift = Date.now() - serverNow()
  return {
    id: Number(msg.id),
    phase: msg.phase as Phase,
    startAt: Number(msg.startAt) + shift,
    point: msg.point === null ? null : Number(msg.point),
    hash: String(msg.hash),
    seed: (msg.seed as string | null) ?? null,
    bets: (msg.bets as CrashBetView[]) ?? [],
    history: (msg.history as CrashSnap['history']) ?? [],
  }
}

export function Crash() {
  const { spend, credit, refund, openSheet, server, serverMove, refreshServer } = useStore()
  const { me, connected } = useLive()
  // С сервером раунды общие и настоящие, без него — общее демо-расписание
  const shared = !!server
  const [phase, setPhase] = useState<Phase>('waiting')
  const [snap, setSnap] = useState<CrashSnap>(() => (shared ? EMPTY_SNAP : demoSnap()))
  const [bet, setBet] = useState(1)
  const [autoOn, setAutoOn] = useState(false)
  const [auto, setAuto] = useState('2.00')
  // Своя ставка в демо. С сервером своя ставка — запись в общем списке ставок раунда
  const [localBet, setLocalBet] = useState<MyBet | null>(null)
  const [pending, setPending] = useState(false)
  const [placedRound, setPlacedRound] = useState(0)
  const [crashAt, setCrashAt] = useState(1)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef(0)
  const betKey = useRef('')

  const serverBet = shared ? snap.bets.find((b) => b.uid === me) : undefined
  const myBet: MyBet | null = shared
    ? serverBet
      ? { amount: Number(serverBet.amount), cashed: serverBet.cashed ?? undefined }
      : placedRound === snap.id
        ? { amount: bet }
        : null
    : localBet

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const multRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const cashRef = useRef<HTMLSpanElement>(null)
  const milestoneRef = useRef<HTMLDivElement>(null)

  // Цикл анимации живёт вне React: он читает свежие значения через refs.
  // startPerf — момент взлёта по performance.now(), crash — точка взрыва (с сервера неизвестна до взрыва)
  const round = useRef({ id: 0, phase: 'waiting' as Phase, startPerf: performance.now() + WAIT_MS, since: performance.now(), crash: Infinity, m: 1, crashT: 0 })
  const live = useRef({ myBet, autoOn, auto, credit, shared })
  live.current = { myBet, autoOn, auto, credit, shared }
  /** Применить снимок раунда. Задаётся внутри цикла анимации: ему нужны его сцены. */
  const applyRef = useRef<((s: CrashSnap) => void) | null>(null)

  const showNotice = (n: Omit<Notice, 'id'>) => {
    window.clearTimeout(noticeTimer.current)
    setNotice({ ...n, id: ++noticeSeq })
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  // Снимки общего раунда с сервера: при входе в раздел и после каждого изменения
  useEffect(() => {
    if (!shared) return
    setSnap(EMPTY_SNAP)
    const off = onLive('crash', (msg) => {
      const s = fromServer(msg)
      setSnap(s)
      applyRef.current?.(s)
    })
    // Снимок мог прийти до подписки (сервер нашёлся позже входа в раздел) — просим его заново
    rejoinRoom()
    return off
  }, [shared])

  // Автовывод с сервера: ставку вывел сервер, сообщаем игроку и обновляем баланс
  const shownWin = useRef(0)
  useEffect(() => {
    if (!serverBet?.cashed || shownWin.current === snap.id) return
    shownWin.current = snap.id
    haptic.success()
    showNotice({ win: true, mult: serverBet.cashed, amount: Number(serverBet.payout) })
    refreshServer()
  }, [serverBet?.cashed, snap.id])

  const cashOut = () => {
    const r = round.current
    const mb = live.current.myBet
    if (r.phase !== 'flying' || !mb || mb.cashed) return
    if (live.current.shared) {
      // Множитель вывода считает сервер по своим часам: у всех игроков он один
      setPending(true)
      api<{ cashed: number; payout: string; balance: string }>('/crash/cashout', { method: 'POST' })
        .then((res) => {
          serverMove(res.balance, 'win', `${t('Краш')} ${fmtMult(res.cashed)}`, Number(res.payout))
          shownWin.current = round.current.id
          haptic.success()
          showNotice({ win: true, mult: res.cashed, amount: Number(res.payout) })
        })
        .catch((e) => {
          haptic.error()
          toast(String(e.message ?? e), 'error')
        })
        .finally(() => setPending(false))
      return
    }
    const m = r.m
    live.current.credit(mb.amount * m, `${t('Краш')} ${fmtMult(m)}`)
    const next = { ...mb, cashed: m }
    live.current.myBet = next
    setLocalBet(next)
    haptic.success()
    showNotice({ win: true, mult: m, amount: mb.amount * m })
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    const resize = () => {
      const rect = wrapRef.current!.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrapRef.current!)

    // Звёзды на разной глубине: дальние тусклее и сдвигаются медленнее
    const stars: Star[] = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.3 + Math.random() ** 2 * 1.4,
      depth: 0.15 + Math.random() * 0.85,
      phase: Math.random() * Math.PI * 2,
    }))
    let drift = 0
    let shoot: { x: number; y: number; at: number } | null = null
    let level = 0
    let particles: Particle[] = []
    let flash: { at: number; color: string } | null = null
    let frameDt = 16

    // Сцены рубежей: x2 корова, x5 большая фиолетовая тарелка, x10 планеты, x100 чёрная дыра
    let abduct: { at: number; done: boolean } | null = null
    let ufoScale = 1
    let planets: Planet[] = []
    let nextPlanetAt = 0
    let dodge = 0
    let hole: { at: number } | null = null
    let debris: { a: number; r: number; size: number; hue: number }[] = []

    const burst = (x: number, y: number, color: string, count: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const v = speed * (0.35 + Math.random() * 0.9)
        const max = 500 + Math.random() * 600
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color, size: 1.2 + Math.random() * 2.2 })
      }
    }

    // Перезапуск CSS-анимации: снять класс, дать браузеру перерисовать, вернуть
    const restartClass = (el: Element | null, cls: string) => {
      if (!el) return
      el.classList.remove(cls)
      void (el as HTMLElement).offsetWidth
      el.classList.add(cls)
    }

    const setLevelClass = (lvl: number) => {
      const stage = wrapRef.current
      if (!stage) return
      for (let i = 1; i <= MILESTONES.length; i++) stage.classList.toggle(`lvl-${i}`, i === lvl)
    }

    const resetLevels = () => {
      level = 0
      particles = []
      abduct = null
      ufoScale = 1
      planets = []
      dodge = 0
      hole = null
      debris = []
      setLevelClass(0)
    }

    const onMilestone = (lvl: number, x: number, y: number, now: number) => {
      const color = MILESTONE_COLOR[lvl - 1]
      burst(x, y, color, 22 + lvl * 12, 0.12 + lvl * 0.05)
      if (lvl >= 3) burst(x, y, '#ffffff', 16, 0.3)
      flash = { at: now, color }
      setLevelClass(lvl)
      if (lvl === 1) abduct = { at: now, done: false }
      if (lvl === 3) nextPlanetAt = now + 300
      if (lvl === 5) hole = { at: now }
      const label = milestoneRef.current
      if (label) {
        label.dataset.lvl = String(lvl)
        label.querySelector('b')!.textContent = `x${MILESTONES[lvl - 1]}`
        label.querySelector('span')!.textContent = t(MILESTONE_TEXT[lvl - 1])
        restartClass(label, 'is-on')
      }
      if (lvl >= 3) haptic.heavy()
      else haptic.tap()
    }

    const drawParticles = () => {
      const k = frameDt / 16
      particles = particles.filter((p) => (p.life -= frameDt) > 0)
      for (const p of particles) {
        p.x += p.vx * frameDt
        p.y += p.vy * frameDt
        p.vy += 0.00025 * frameDt
        p.vx *= 0.985 ** k
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ---------- x100: чёрная дыра ----------

    const holePos = () => ({ x: w * 0.34, y: h * 0.48 })
    const holeRadius = (now: number) => (hole ? Math.min(w, h) * 0.17 * easeOutBack(Math.min(1, (now - hole.at) / 1600)) : 0)

    const drawSpace = (now: number) => {
      const hp = holePos()
      const hr = holeRadius(now)
      for (const st of stars) {
        let sx = ((((st.x - drift * st.depth) % 1) + 1) % 1) * w
        let sy = st.y * h
        // Рядом с дырой звёзды стягиваются к ней, будто свет огибает горизонт
        if (hr > 1) {
          const dx = sx - hp.x
          const dy = sy - hp.y
          const d = Math.hypot(dx, dy)
          if (d < hr * 1.05) continue
          const pull = Math.min(0.55, (hr * hr * 1.8) / (d * d))
          sx -= dx * pull
          sy -= dy * pull
        }
        const twinkle = 0.55 + 0.45 * Math.sin(now * 0.0021 * (0.4 + st.depth) + st.phase)
        ctx.globalAlpha = (0.25 + 0.75 * st.depth) * twinkle
        ctx.fillStyle = st.depth > 0.8 ? '#dff4ff' : '#ffffff'
        ctx.beginPath()
        ctx.arc(sx, sy, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // Изредка пролетает падающая звезда
      if (!shoot && Math.random() < 0.004) shoot = { x: 0.3 + Math.random() * 0.7, y: Math.random() * 0.4, at: now }
      if (shoot) {
        const k = (now - shoot.at) / 700
        if (k >= 1) shoot = null
        else {
          const x0 = shoot.x * w - k * 160
          const y0 = shoot.y * h + k * 70
          const tail = ctx.createLinearGradient(x0, y0, x0 + 60, y0 - 26)
          tail.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`)
          tail.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.strokeStyle = tail
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x0 + 60, y0 - 26)
          ctx.stroke()
        }
      }
    }

    const HOLE_TILT = -0.32

    const drawHole = (now: number) => {
      const R = holeRadius(now)
      if (R <= 0.5) return
      const { x, y } = holePos()

      const halo = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 3.2)
      halo.addColorStop(0, 'rgba(160,90,255,0.45)')
      halo.addColorStop(0.5, 'rgba(255,120,60,0.12)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(x, y, R * 3.2, 0, Math.PI * 2)
      ctx.fill()

      // Аккреционный диск: задняя половина рисуется до горизонта, передняя — поверх
      const disk = (front: boolean) => {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(HOLE_TILT)
        ctx.scale(1, 0.36)
        const n = 40
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + now * 0.0016
          if (Math.sin(a0 + Math.PI / n) > 0 !== front) continue
          ctx.strokeStyle = `hsl(${22 + 18 * Math.sin(i * 1.7)} 100% ${58 + 12 * Math.sin(i * 2.3 + now * 0.004)}%)`
          ctx.lineWidth = R * 0.42
          ctx.beginPath()
          ctx.arc(0, 0, R * 1.65, a0, a0 + (Math.PI * 2) / n + 0.03)
          ctx.stroke()
        }
        ctx.restore()
      }
      ctx.globalAlpha = 0.9
      disk(false)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#000'
      ctx.shadowColor = 'rgba(255,170,90,0.9)'
      ctx.shadowBlur = 18
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,214,150,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, R * 1.04, 0, Math.PI * 2)
      ctx.stroke()
      disk(true)

      // Обломки по спирали уходят за горизонт
      if (debris.length < 60) debris.push({ a: Math.random() * Math.PI * 2, r: R * (2.6 + Math.random() * 1.2), size: 0.8 + Math.random() * 1.6, hue: Math.random() * 360 })
      debris = debris.filter((d) => {
        d.a += frameDt * 0.0025 * ((R * 1.8) / d.r)
        d.r -= frameDt * 0.02 * ((R * 2) / d.r)
        return d.r > R * 0.95
      })
      const cos = Math.cos(HOLE_TILT)
      const sin = Math.sin(HOLE_TILT)
      for (const d of debris) {
        const lx = Math.cos(d.a) * d.r
        const ly = Math.sin(d.a) * d.r * 0.4
        ctx.globalAlpha = Math.min(1, (d.r - R) / R)
        ctx.fillStyle = `hsl(${d.hue} 100% 70%)`
        ctx.beginPath()
        ctx.arc(x + lx * cos - ly * sin, y + lx * sin + ly * cos, d.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ---------- x10: планеты ----------

    const movePlanets = (now: number, spawn: boolean) => {
      if (spawn && level >= 3 && now >= nextPlanetAt) {
        nextPlanetAt = now + (hole ? 1600 : 1000) + Math.random() * 600
        const [c1, c2] = PLANET_COLORS[Math.floor(Math.random() * PLANET_COLORS.length)]
        const r = 7 + Math.random() * 10
        planets.push({ x: w + r + 6, y: h * (0.12 + Math.random() * 0.72), r, vx: -(0.09 + Math.random() * 0.12), c1, c2, ring: Math.random() < 0.35, tilt: (Math.random() - 0.5) * 0.8, s: 1 })
      }
      const hp = holePos()
      const hr = holeRadius(now)
      planets = planets.filter((p) => {
        p.x += p.vx * frameDt
        // Чёрная дыра затягивает планеты: чем ближе, тем сильнее и тем они меньше
        if (hr > 1) {
          const dx = hp.x - p.x
          const dy = hp.y - p.y
          const d = Math.hypot(dx, dy)
          const pull = Math.min(0.08, (hr * hr * 1.2) / (d * d)) * (frameDt / 16)
          p.x += dx * pull
          p.y += dy * pull
          p.s = Math.min(1, Math.max(0, (d - hr) / (hr * 2)))
          if (d < hr * 1.1) {
            burst(p.x, p.y, p.c1, 8, 0.05)
            return false
          }
        }
        return p.x > -p.r * 2 - 20
      })
    }

    const drawPlanet = (p: Planet) => {
      const r = p.r * p.s
      if (r < 0.5) return
      const ring = (front: boolean) => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.tilt)
        ctx.strokeStyle = 'rgba(255,240,210,0.65)'
        ctx.lineWidth = Math.max(1, r * 0.18)
        ctx.beginPath()
        ctx.ellipse(0, 0, r * 1.8, r * 0.5, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      if (p.ring) ring(false)
      const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r)
      g.addColorStop(0, p.c1)
      g.addColorStop(1, p.c2)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      if (p.ring) ring(true)
    }

    /** Смещение тарелки по вертикали, чтобы облететь ближайшую планету на пути. */
    const dodgeOffset = (ux: number, baseY: number) => {
      const cur = baseY + dodge
      const need = (p: Planet) => p.r * p.s + 24 * ufoScale
      let desired: number | null = null
      let best = Infinity
      for (const p of planets) {
        const dx = p.x - ux
        if (dx < -p.r - 12 || dx > p.r + 90 || Math.abs(cur - p.y) >= need(p)) continue
        if (dx < best) {
          best = dx
          const up = p.y - need(p)
          const down = p.y + need(p)
          const canUp = up > 22
          const canDown = down < h - 22
          desired = (cur >= p.y ? canDown || !canUp : !canUp) ? down : up
        }
      }
      const target = desired === null ? 0 : Math.max(22, Math.min(h - 22, desired)) - baseY
      // Возвращаемся на траекторию медленнее, чем уходим от планеты
      dodge += (target - dodge) * Math.min(1, frameDt * (desired === null ? 0.004 : 0.012))
      return dodge
    }

    // ---------- x2: похищение коровы ----------

    const drawCow = (x: number, y: number, s: number, rot: number, alpha: number) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.scale(s, s)
      ctx.fillStyle = '#2a2a2a'
      for (const lx of [-8, -3.5, 3.5, 8]) ctx.fillRect(lx - 1.2, 3, 2.4, 7)
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(-11, -2)
      ctx.quadraticCurveTo(-16, 0, -14, 6)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.ellipse(-4, -2, 3.6, 2.8, 0.3, 0, Math.PI * 2)
      ctx.ellipse(5, 1.5, 3, 2.4, -0.2, 0, Math.PI * 2)
      ctx.ellipse(1, -5, 2.2, 1.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffb3c7'
      ctx.beginPath()
      ctx.ellipse(2, 6, 2.6, 1.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e8dcc0'
      ctx.beginPath()
      ctx.moveTo(10.5, -7)
      ctx.lineTo(11.2, -10)
      ctx.lineTo(12.4, -7.2)
      ctx.moveTo(14, -7.4)
      ctx.lineTo(15.4, -10.2)
      ctx.lineTo(15.8, -7)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(13, -4, 5, 4.3, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.ellipse(9.4, -6, 1.8, 1.1, -0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffb3c7'
      ctx.beginPath()
      ctx.ellipse(16.2, -2.6, 2.8, 2.3, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(12.3, -5.4, 0.9, 0, Math.PI * 2)
      ctx.arc(16.8, -2.7, 0.45, 0, Math.PI * 2)
      ctx.arc(15.5, -2.2, 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const ABDUCT_MS = 2800

    const drawAbduction = (ux: number, uy: number, now: number) => {
      if (!abduct) return
      const k = (now - abduct.at) / ABDUCT_MS
      if (k >= 1) {
        abduct = null
        return
      }
      const ground = h - 16
      const top = uy + 8 * ufoScale
      const env = Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.12)

      // Луч от тарелки до земли и бегущие вверх кольца
      const beam = ctx.createLinearGradient(0, top, 0, ground)
      beam.addColorStop(0, `rgba(140,255,225,${0.55 * env})`)
      beam.addColorStop(1, `rgba(140,255,225,${0.1 * env})`)
      ctx.fillStyle = beam
      ctx.beginPath()
      ctx.moveTo(ux - 12, top)
      ctx.lineTo(ux + 12, top)
      ctx.lineTo(ux + 40, ground)
      ctx.lineTo(ux - 40, ground)
      ctx.closePath()
      ctx.fill()
      ctx.lineWidth = 1.2
      for (let i = 0; i < 3; i++) {
        const q = (now / 700 + i / 3) % 1
        ctx.strokeStyle = `rgba(200,255,240,${0.55 * env * (1 - q)})`
        ctx.beginPath()
        ctx.ellipse(ux, ground - (ground - top) * q, 40 - 28 * q, 4 - 2 * q, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      const spot = ctx.createRadialGradient(ux, ground, 0, ux, ground, 44)
      spot.addColorStop(0, `rgba(140,255,225,${0.35 * env})`)
      spot.addColorStop(1, 'rgba(140,255,225,0)')
      ctx.fillStyle = spot
      ctx.beginPath()
      ctx.ellipse(ux, ground, 44, 8, 0, 0, Math.PI * 2)
      ctx.fill()

      // Корова сначала стоит в луче, потом плавно поднимается и исчезает в тарелке
      const rise = easeInOut(Math.min(1, Math.max(0, (k - 0.12) / 0.7)))
      if (rise < 1) {
        const cy = ground - 6 - (ground - 6 - (top + 4)) * rise
        drawCow(ux + Math.sin(now / 250) * 4 * rise, cy, 1 - 0.55 * rise, Math.sin(now / 180) * 0.35 * rise, rise > 0.9 ? (1 - rise) * 10 : 1)
      } else if (!abduct.done) {
        abduct.done = true
        burst(ux, top, '#8cffe1', 18, 0.12)
      }
    }

    // ---------- Тарелка ----------

    const UFO_LIGHTS = ['#ff5fa8', '#ffc542', '#5dff9a', '#4dd6e8', '#9b6bff']

    const drawUfo = (x: number, y: number, tilt: number, now: number) => {
      // С x5 тарелка большая и фиолетовая
      const violet = level >= 2
      ctx.save()
      ctx.translate(x, y + Math.sin(now / 260) * 1.6)
      ctx.rotate(tilt)
      ctx.scale(ufoScale, ufoScale)

      // С x50 вокруг тарелки пульсирует кольцо, с x100 оно переливается
      if (level >= 4) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 140)
        ctx.lineWidth = 2.5
        ctx.strokeStyle = level >= 5 ? `hsl(${(now / 6) % 360} 100% 65%)` : `rgba(255,95,122,${0.5 + pulse * 0.5})`
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = 16
        ctx.beginPath()
        ctx.ellipse(0, 0, 34 + pulse * 6, 18 + pulse * 3, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      const glow = ctx.createRadialGradient(0, 9, 2, 0, 9, 36)
      glow.addColorStop(0, violet ? 'rgba(180,107,255,0.6)' : 'rgba(93,255,190,0.5)')
      glow.addColorStop(1, 'rgba(93,255,190,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.ellipse(0, 10, 36, 16, 0, 0, Math.PI * 2)
      ctx.fill()

      // Пилот под стеклом купола
      ctx.fillStyle = '#5dff9a'
      ctx.beginPath()
      ctx.ellipse(0, -6, 4.3, 5.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#06140d'
      ctx.beginPath()
      ctx.ellipse(-1.8, -6.6, 1.2, 1.9, -0.45, 0, Math.PI * 2)
      ctx.ellipse(1.8, -6.6, 1.2, 1.9, 0.45, 0, Math.PI * 2)
      ctx.fill()

      const dome = ctx.createLinearGradient(0, -16, 0, -1)
      dome.addColorStop(0, violet ? 'rgba(236,210,255,0.8)' : 'rgba(180,240,255,0.75)')
      dome.addColorStop(1, violet ? 'rgba(150,80,255,0.4)' : 'rgba(60,140,255,0.35)')
      ctx.fillStyle = dome
      ctx.beginPath()
      ctx.ellipse(0, -2, 11.5, 13, 0, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.ellipse(-5, -9.5, 2, 3.6, -0.5, 0, Math.PI * 2)
      ctx.fill()

      const body = ctx.createLinearGradient(0, -4, 0, 9)
      body.addColorStop(0, violet ? '#f6ecff' : '#f1f5fb')
      body.addColorStop(0.5, violet ? '#b27cff' : '#9ea9bf')
      body.addColorStop(1, violet ? '#4b2580' : '#465066')
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(0, 2, 25, 7.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(0, 1, 24, 6.4, 0, Math.PI * 1.04, Math.PI * 1.96)
      ctx.stroke()

      // Бегущие огоньки по краю
      const lit = Math.floor(now / 160) % UFO_LIGHTS.length
      for (let i = 0; i < UFO_LIGHTS.length; i++) {
        const on = i === lit
        ctx.fillStyle = UFO_LIGHTS[i]
        ctx.globalAlpha = on ? 1 : 0.45
        ctx.shadowColor = UFO_LIGHTS[i]
        ctx.shadowBlur = on ? 10 : 0
        ctx.beginPath()
        ctx.arc(-16 + i * 8, 4.2, on ? 2.1 : 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.restore()
    }

    /** Вспышка и разлёт обломков в точке краша. k — время с момента взрыва от 0 до 1. */
    const drawBoom = (x: number, y: number, k: number) => {
      const e = Math.min(1, k)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 14 + e * 46)
      glow.addColorStop(0, `rgba(255,240,200,${0.95 * (1 - e)})`)
      glow.addColorStop(0.4, `rgba(255,120,80,${0.7 * (1 - e)})`)
      glow.addColorStop(1, 'rgba(255,77,103,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, 14 + e * 46, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,170,120,${0.8 * (1 - e)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 8 + e * 60, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(220,226,240,${1 - e})`
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + i
        const d = 6 + e * (30 + (i % 3) * 14)
        ctx.fillRect(x + Math.cos(a) * d - 1.5, y + Math.sin(a) * d + e * e * 20 - 1.5, 3, 3)
      }
    }

    const draw = (t: number, m: number, crashed: boolean, now: number) => {
      ctx.clearRect(0, 0, w, h)
      drawSpace(now)
      drawHole(now)
      const padL = 12
      const padB = 14
      const padT = 30
      const padR = 30
      const maxT = Math.max(9000, t * 1.12)
      const maxM = Math.max(2, 1 + (m - 1) * 1.25)
      const X = (tt: number) => padL + (tt / maxT) * (w - padL - padR)
      const Y = (mm: number) => h - padB - ((mm - 1) / (maxM - 1)) * (h - padB - padT)

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.font = '500 10px Inter, sans-serif'
      for (let i = 1; i <= 4; i++) {
        const mm = 1 + ((maxM - 1) * i) / 4
        const y = Y(mm)
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - 4, y)
        ctx.stroke()
        ctx.fillText(`${mm.toFixed(mm < 10 ? 1 : 0)}x`, w - padR + 2, y - 3)
      }

      movePlanets(now, !crashed && t > 0)
      planets.forEach(drawPlanet)

      // До старта тарелка висит на стартовой точке
      if (t <= 0) {
        drawUfo(X(0) + 26, Y(1) - 16, 0, now)
        return
      }

      const steps = 80
      const color = crashed ? '#ff4d67' : '#5dff9a'
      ctx.beginPath()
      ctx.moveTo(X(0), Y(1))
      for (let i = 1; i <= steps; i++) {
        const tt = (t * i) / steps
        ctx.lineTo(X(tt), Y(Math.min(m, Math.exp(GROWTH * tt))))
      }
      const tipX = X(t)
      const tipY = Y(m)
      const fill = ctx.createLinearGradient(0, tipY, 0, h)
      fill.addColorStop(0, crashed ? 'rgba(255,77,103,0.22)' : 'rgba(93,255,190,0.14)')
      fill.addColorStop(1, 'rgba(46,167,255,0)')
      ctx.save()
      ctx.lineTo(tipX, h - padB)
      ctx.lineTo(X(0), h - padB)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.restore()

      ctx.beginPath()
      ctx.moveTo(X(0), Y(1))
      for (let i = 1; i <= steps; i++) {
        const tt = (t * i) / steps
        ctx.lineTo(X(tt), Y(Math.min(m, Math.exp(GROWTH * tt))))
      }
      const line = ctx.createLinearGradient(X(0), 0, tipX, 0)
      line.addColorStop(0, '#2ea7ff')
      line.addColorStop(1, color)
      ctx.strokeStyle = line
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.shadowColor = color
      ctx.shadowBlur = 14
      ctx.stroke()
      ctx.shadowBlur = 0

      if (crashed) {
        drawParticles()
        drawBoom(tipX, tipY, (now - round.current.since) / 900)
        return
      }

      const baseY = tipY - 10
      while (level < MILESTONES.length && m >= MILESTONES[level]) {
        level += 1
        onMilestone(level, tipX, baseY, now)
      }
      ufoScale += ((level >= 2 ? 1.4 : 1) - ufoScale) * Math.min(1, frameDt * 0.006)
      const ufoY = baseY + dodgeOffset(tipX, baseY)

      drawAbduction(tipX, ufoY, now)

      // С x5 за тарелкой тянется искрящийся след, с x100 — радужный
      if (level >= 2) {
        for (let i = 0; i < level - 1; i++) {
          particles.push({
            x: tipX - 16 * ufoScale + Math.random() * 6,
            y: ufoY + 4 + (Math.random() - 0.5) * 6,
            vx: -0.05 - Math.random() * 0.06,
            vy: (Math.random() - 0.5) * 0.03,
            life: 600,
            max: 600,
            color: level >= 5 ? `hsl(${(now / 4 + i * 60) % 360} 100% 65%)` : MILESTONE_COLOR[level - 1],
            size: 1 + Math.random() * 1.6,
          })
        }
      }
      drawParticles()

      // Наклон тарелки по ходу траектории и манёвра, без переворотов
      const prevT = t * 0.96
      const slope = Math.atan2(tipY - Y(Math.exp(GROWTH * prevT)), tipX - X(prevT))
      drawUfo(tipX, ufoY, Math.max(-0.45, Math.min(0.25, slope * 0.55 + dodge * 0.004)), now)

      if (flash) {
        const k = (now - flash.at) / 450
        if (k >= 1) flash = null
        else {
          ctx.globalAlpha = 0.35 * (1 - k)
          ctx.fillStyle = flash.color
          ctx.fillRect(0, 0, w, h)
          ctx.globalAlpha = 1
        }
      }
    }

    /** Взрыв на точке r.crash: у всех игроков на одном и том же множителе. */
    const explode = (now: number) => {
      const r = round.current
      r.phase = 'crashed'
      r.since = now
      r.m = r.crash
      r.crashT = flightMs(r.crash)
      setPhase('crashed')
      setCrashAt(r.crash)
      const mb = live.current.myBet
      if (mb && !mb.cashed) {
        haptic.error()
        showNotice({ win: false, mult: r.crash, amount: mb.amount })
      }
      if (multRef.current) multRef.current.textContent = fmtMult(r.crash)
    }

    // Снимок раунда (с сервера или из демо-расписания) задаёт номер, фазу, время взлёта и точку
    applyRef.current = (s: CrashSnap) => {
      const r = round.current
      const now = performance.now()
      if (s.id !== r.id) {
        r.id = s.id
        r.crash = Infinity
        r.m = 1
        resetLevels()
        if (!live.current.shared) {
          live.current.myBet = null
          setLocalBet(null)
        }
        r.phase = 'waiting'
        setPhase('waiting')
      }
      r.startPerf = now + (s.startAt - Date.now())
      if (s.point !== null) r.crash = s.point
      if (s.phase === 'crashed' && r.phase !== 'crashed') explode(now)
      else if (s.phase === 'flying' && r.phase === 'waiting') {
        r.phase = 'flying'
        setPhase('flying')
      }
      setSnap(s)
    }
    // С сервером ждём его снимок, в демо раунд известен сразу
    if (!live.current.shared) applyRef.current(demoSnap())

    let raf = 0
    let last = performance.now()
    let lastDemo = 0
    const frame = (now: number) => {
      const r = round.current
      frameDt = Math.min(50, now - last)
      drift += frameDt * (r.phase === 'flying' ? 0.00003 * (1 + Math.log(r.m) * 1.5) : 0.000004)
      last = now
      // Демо: раунд берём из общего расписания по часам устройства
      if (!live.current.shared && now - lastDemo > 200) {
        lastDemo = now
        applyRef.current?.(demoSnap())
      }
      if (r.phase === 'waiting') {
        const left = Math.max(0, r.startPerf - now)
        if (timerRef.current) timerRef.current.textContent = `${(left / 1000).toFixed(1)} с`
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, left / WAIT_MS)})`
        draw(0, 1, false, now)
        if (left <= 0) {
          r.phase = 'flying'
          r.m = 1
          setPhase('flying')
        }
      } else if (r.phase === 'flying') {
        const t = Math.max(0, now - r.startPerf)
        const m = Math.exp(GROWTH * t)
        if (m >= r.crash) {
          explode(now)
          draw(r.crashT, r.crash, true, now)
        } else {
          r.m = m
          if (multRef.current) multRef.current.textContent = fmtMult(m)
          const mb = live.current.myBet
          if (mb && !mb.cashed) {
            if (cashRef.current) cashRef.current.textContent = fmtAmount(mb.amount * m)
            // С сервером автовывод делает сам сервер, в демо — здесь
            const target = parseFloat(live.current.auto.replace(',', '.'))
            if (!live.current.shared && live.current.autoOn && target > 1 && m >= target) cashOut()
          }
          draw(t, m, false, now)
        }
      } else {
        // После взрыва ждём следующий раунд: его начало приходит снимком
        draw(r.crashT, r.crash, true, now)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      applyRef.current = null
    }
  }, [shared])

  const placeBet = () => {
    if (phase !== 'waiting' || myBet || pending) return
    if (shared) {
      // Ставку принимает только сервер. Ключ повторной отправки живёт до успешного ответа
      const target = parseFloat(auto.replace(',', '.'))
      betKey.current ||= newKey()
      setPending(true)
      haptic.tap()
      const roundId = snap.id
      api<{ id: number; amount: string; balance: string }>('/crash/bet', {
        method: 'POST',
        body: { amount: bet.toFixed(9), auto: autoOn && target > 1 ? target : null, key: betKey.current },
      })
        .then((res) => {
          betKey.current = ''
          setPlacedRound(res.id ?? roundId)
          serverMove(res.balance, 'bet', 'Ставка в краше', -Number(res.amount))
        })
        .catch((e) => {
          haptic.error()
          const text = String(e.message ?? e)
          if (text.includes('Недостаточно')) openSheet('deposit')
          toast(text, 'error')
          // Ставка точно не принята — следующий запрос будет новой ставкой
          if (!text.includes('уже сделана')) betKey.current = ''
        })
        .finally(() => setPending(false))
      return
    }
    if (!spend(bet, 'Ставка в краше')) {
      haptic.error()
      openSheet('deposit')
      return
    }
    haptic.tap()
    const mb = { amount: bet }
    live.current.myBet = mb
    setLocalBet(mb)
  }

  const cancelBet = () => {
    if (phase !== 'waiting' || !myBet || pending) return
    if (shared) {
      setPending(true)
      api<{ balance: string }>('/crash/cancel', { method: 'POST' })
        .then((res) => {
          setPlacedRound(0)
          serverMove(res.balance, 'refund', 'Отмена ставки', myBet.amount)
        })
        .catch((e) => toast(String(e.message ?? e), 'error'))
        .finally(() => setPending(false))
      return
    }
    refund(myBet.amount, 'Отмена ставки')
    live.current.myBet = null
    setLocalBet(null)
  }

  const players = shared ? snap.bets : myBet ? [{ uid: 0, name: t('Вы'), photo: null, amount: String(myBet.amount), auto: null, cashed: myBet.cashed ?? null, payout: '0' }] : []
  const pot = players.reduce((sum, b) => sum + Number(b.amount), 0)
  const reconnecting = shared && !connected

  let action
  if (phase === 'waiting') {
    action = myBet ? (
      <button type="button" className="btn btn--ghost btn--lg btn--block" onClick={cancelBet} disabled={pending}>
        {t('Ставка принята · отменить')}
      </button>
    ) : (
      <button type="button" className="btn btn--primary btn--lg btn--block" onClick={placeBet} disabled={pending || reconnecting}>
        {pending ? t('Отправляем ставку…') : <>{t('Поставить')} <Money ton={bet} size={16} /></>}
      </button>
    )
  } else if (phase === 'flying' && myBet && !myBet.cashed) {
    action = (
      <button type="button" className="btn btn--success btn--lg btn--block" onClick={cashOut} disabled={pending}>
        {t('Забрать')}
        <span className="money">
          <TonIcon size={16} />
          <span ref={cashRef}>{fmtAmount(myBet.amount)}</span>
        </span>
      </button>
    )
  } else if (myBet?.cashed) {
    action = (
      <button type="button" className="btn btn--ghost btn--lg btn--block" disabled>
        {t('Вы забрали')} {fmtMult(myBet.cashed)} · <Money ton={myBet.amount * myBet.cashed} size={16} />
      </button>
    )
  } else {
    action = (
      <button type="button" className="btn btn--ghost btn--lg btn--block" disabled>
        {reconnecting ? t('Переподключаемся…') : phase === 'crashed' && myBet ? t('Ставка сгорела') : t('Ждём следующий раунд')}
      </button>
    )
  }

  return (
    <div className="screen">
      <PageHead title={t('Краш')} room="crash" />

      <div className="hist-row">
        {snap.history.map((r) => (
          <span key={r.id} className={`hist-chip hist-chip--${multTone(r.point)}`}>
            {fmtMult(r.point)}
          </span>
        ))}
      </div>

      <div className={`crash-stage is-${phase}`} ref={wrapRef}>
        <canvas ref={canvasRef} className="crash-stage__canvas" />
        <div ref={milestoneRef} className="crash-milestone" aria-hidden>
          <b />
          <span />
        </div>
        {notice && (
          <div key={notice.id} className={`crash-notice ${notice.win ? 'crash-notice--win' : 'crash-notice--lose'}`} role="status">
            <span className="crash-notice__title">{notice.win ? t('Победа!') : t('Проигрыш')}</span>
            <span className="crash-notice__mult">{fmtMult(notice.mult)}</span>
            <Money ton={notice.win ? notice.amount : -notice.amount} size={14} sign={notice.win} className="crash-notice__amount" />
          </div>
        )}
        <div className="crash-stage__overlay">
          {phase === 'waiting' ? (
            <div className="crash-wait">
              <div className="crash-wait__label">Раунд начнётся через</div>
              <span ref={timerRef} className="crash-wait__timer">
                6.0 с
              </span>
              <div className="crash-wait__bar">
                <div ref={barRef} />
              </div>
            </div>
          ) : (
            <div className="crash-mult-wrap">
              {phase === 'crashed' && <div className="crash-mult__label">Улетела на</div>}
              <div ref={multRef} className="crash-mult">
                {fmtMult(phase === 'crashed' ? crashAt : 1)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <BetInput value={bet} onChange={setBet} disabled={phase !== 'waiting' || !!myBet} />
        <div className="auto-row">
          {/* С сервером автовывод уходит вместе со ставкой, после ставки его не поменять */}
          <button type="button" className={`toggle ${autoOn ? 'is-on' : ''}`} onClick={() => setAutoOn((v) => !v)} aria-pressed={autoOn} disabled={shared && !!myBet}>
            <span className="toggle__dot" /> {t('Автовывод')}
          </button>
          <label className="auto-row__input">
            <span>x</span>
            <input inputMode="decimal" value={auto} onChange={(e) => setAuto(e.target.value)} aria-label={t('Множитель автовывода')} disabled={shared && !!myBet} />
          </label>
        </div>
        {action}
      </div>

      <div className="panel players">
        <div className="players__head">
          <span>
            {t('Игроки')} · {players.length}
          </span>
          <Money ton={pot} size={13} />
        </div>
        {players.length === 0 && <div className="players__empty muted small">{shared ? t('Пока никто не поставил в этом раунде') : t('Ставки других игроков видны, когда сервер онлайн')}</div>}
        {players.map((b) => {
          const mine = !shared || b.uid === me
          return (
            <div key={b.uid} className={`player-row ${mine ? 'is-me' : ''} ${b.cashed ? 'is-won' : phase === 'crashed' ? 'is-lost' : ''}`}>
              <Avatar name={mine ? t('Вы') : b.name} color={mine ? '#2ea7ff' : colorOf(b.uid)} photo={b.photo ?? undefined} size={28} />
              <span className="player-row__name">{mine ? t('Вы') : b.name}</span>
              <Money ton={b.cashed ? Number(b.payout) || Number(b.amount) * b.cashed : Number(b.amount)} size={12} />
              <span className="player-row__result">{b.cashed ? fmtMult(b.cashed) : phase === 'crashed' ? '—' : '…'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
