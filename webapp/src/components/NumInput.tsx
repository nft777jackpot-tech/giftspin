import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { parseTon } from './BetInput'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number
  /** Как показывать число в поле. */
  format(n: number): string
  /** Новое число: пока игрок печатает (если оно годится) и при уходе из поля. */
  onValue(n: number): void
}

/**
 * Числовое поле, которое можно стереть целиком: текст хранится отдельно от числа и
 * выравнивается по нему, когда игрок уходит из поля.
 */
export function NumInput({ value, format, onValue, onFocus, onBlur, ...rest }: Props) {
  const [text, setText] = useState(() => format(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(format(value))
  }, [value, editing])
  return (
    <input
      inputMode="decimal"
      {...rest}
      value={text}
      onFocus={(e) => {
        setEditing(true)
        e.target.select()
        onFocus?.(e)
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '')
        setText(raw)
        const n = parseTon(raw)
        if (n !== null) onValue(n)
      }}
      onBlur={(e) => {
        setEditing(false)
        setText(format(value))
        onBlur?.(e)
      }}
    />
  )
}
