import { useEffect, useState } from 'react'

interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

const EVENT = 'app:toast'
let seq = 0

export function toast(text: string, tone: Toast['tone'] = 'info') {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, text, tone } }))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail
      setItems((list) => [...list, t])
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 2600)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
