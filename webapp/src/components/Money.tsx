import { fmtAmount } from '../lib/format'
import { TonIcon } from './icons'

interface Props {
  ton: number
  size?: number
  className?: string
  sign?: boolean
}

export function Money({ ton, size = 14, className = '', sign }: Props) {
  return (
    <span className={`money ${className}`}>
      <TonIcon size={size} />
      <span>
        {sign && ton > 0 ? '+' : ''}
        {fmtAmount(ton)}
      </span>
    </span>
  )
}
