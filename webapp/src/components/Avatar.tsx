interface Props {
  name: string
  color: string
  size?: number
  photo?: string
}

export function Avatar({ name, color, size = 32, photo }: Props) {
  const letter = name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '?'
  if (photo) return <img className="avatar" src={photo} width={size} height={size} alt="" />
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${color}, ${color}88)` }}
    >
      {letter}
    </span>
  )
}
