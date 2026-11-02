import { t } from '../lib/i18n'
import { useLive } from '../lib/live'

/**
 * Мигающая зелёная точка с числом игроков в разделе прямо сейчас. Число — от сервера.
 * Без сервера (демо) других игроков не видно: на своей странице показываем только себя, на плитках — ничего.
 */
export function OnlineDot({ room, here, className = '' }: { room: string; here?: boolean; className?: string }) {
  const { connected, rooms } = useLive()
  if (!connected && !here) return null
  const count = connected ? (rooms[room] ?? 0) : 1
  return (
    <span className={`online-dot ${count === 0 ? 'is-empty' : ''} ${className}`} title={t('Сейчас в игре')}>
      <i aria-hidden />
      {count}
    </span>
  )
}
