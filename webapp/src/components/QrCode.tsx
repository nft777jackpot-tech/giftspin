import { useMemo } from 'react'
import { encode } from 'uqr'

/** QR-код в SVG. Тёмные модули на белом в любой теме: так его прочитает любой сканер. */
export function QrCode({ value, size = 184, label }: { value: string; size?: number; label: string }) {
  const { path, n } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`
      }),
    )
    return { path: d, n: qr.size }
  }, [value])

  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#0b0f1a" />
    </svg>
  )
}
