import { useEffect, useState, type ReactNode } from 'react'
import { IconCheck, IconClock, IconGift, IconMegaphone, IconShare, IconUsers, IconWallet, IconGames, TonIcon } from '../components/icons'
import { PageHead } from '../components/PageHead'
import { toast } from '../components/Toaster'
import { CHANNEL } from '../config'
import { REF_FRIENDS, weekStart } from '../data/social'
import { TASKS, type TaskAction, type TaskDef } from '../data/tasks'
import { fmtAmount, fmtCountdown } from '../lib/format'
import { t } from '../lib/i18n'
import { channelLink } from '../lib/links'
import { haptic, openTg } from '../lib/telegram'
import { useNav } from '../state/nav'
import { useStore } from '../state/store'

const DAY = 86400000

const ICONS: Record<TaskAction, ReactNode> = {
  daily: <IconGift size={20} />,
  subscribe: <IconMegaphone size={20} />,
  play: <IconGames size={20} />,
  deposit: <IconWallet size={20} />,
  share: <IconShare size={20} />,
  invite: <IconUsers size={20} />,
}

// Друзья с депозитом в демо
const ACTIVE_REFS = REF_FRIENDS.filter((f) => f.wagered > 0).length

/** Задание считается выполненным в текущем периоде: сутки, турнирная неделя или навсегда. */
function doneNow(task: TaskDef, at: number | undefined, now: number): boolean {
  if (!at) return false
  if (task.repeat === 'daily') return now - at < DAY
  if (task.repeat === 'weekly') return at >= weekStart(now)
  return true
}

export function Tasks() {
  const { stats, tasksDone, completeTask, openSheet } = useStore()
  const { open, setTab } = useNav()
  const [opened, setOpened] = useState(false)
  const [checking, setChecking] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const claim = (task: TaskDef) => {
    completeTask(task.id, task.reward, t(task.title))
    haptic.success()
    toast(t('Награда зачислена'), 'success')
  }

  const go = (task: TaskDef) => {
    haptic.tap()
    switch (task.action) {
      case 'subscribe':
        if (!opened) {
          openTg(channelLink())
          setOpened(true)
          return
        }
        // В бою бот проверяет подписку через getChatMember, здесь имитируем ответ
        setChecking(true)
        window.setTimeout(() => {
          setChecking(false)
          claim(task)
        }, 900)
        return
      case 'deposit':
        openSheet('deposit')
        return
      case 'invite':
        open({ name: 'referrals' })
        return
      case 'share':
        toast(t('Выиграйте в любой игре и нажмите «Поделиться выигрышем»'))
        return
      default:
        setTab('games')
    }
  }

  const available = TASKS.filter((task) => {
    const progress = task.progress?.(stats, ACTIVE_REFS) ?? 0
    return !doneNow(task, tasksDone[task.id], now) && (task.action === 'daily' || (task.goal !== undefined && progress >= task.goal))
  }).length

  return (
    <div className="screen">
      <PageHead title={t('Задания')} right={available > 0 ? <span className="badge badge--count">{available}</span> : undefined} />
      <p className="screen-sub">{t('Награды приходят в TON, их можно сразу ставить в любых играх')}</p>

      <div className="task-list">
        {TASKS.map((task) => {
          const done = doneNow(task, tasksDone[task.id], now)
          const progress = Math.min(task.goal ?? 0, task.progress?.(stats, ACTIVE_REFS) ?? 0)
          const ready = task.action === 'daily' || (task.goal !== undefined && progress >= task.goal)
          const next = task.repeat === 'daily' && tasksDone[task.id] ? tasksDone[task.id] + DAY - now : 0
          return (
            <div key={task.id} className={`task ${done ? 'is-done' : ''}`}>
              <span className="task__icon">{ICONS[task.action]}</span>
              <div className="task__main">
                <b>{t(task.title)}</b>
                <span className="muted small">{task.action === 'subscribe' ? `${t(task.sub)} · ${CHANNEL}` : t(task.sub)}</span>
                {task.goal !== undefined && task.goal > 1 && !done && (
                  <div className="task__bar">
                    <div style={{ width: `${(progress / task.goal) * 100}%` }} />
                    <span>
                      {task.goal >= 10 ? Math.floor(progress) : progress} / {task.goal}
                    </span>
                  </div>
                )}
              </div>
              <div className="task__side">
                <span className="task__reward">
                  <TonIcon size={13} /> {fmtAmount(task.reward)}
                </span>
                {done ? (
                  next > 0 ? (
                    <span className="task__timer">
                      <IconClock size={12} /> {fmtCountdown(next)}
                    </span>
                  ) : (
                    <span className="task__ok">
                      <IconCheck size={16} />
                    </span>
                  )
                ) : ready && task.action !== 'subscribe' ? (
                  <button type="button" className="btn btn--success btn--sm" onClick={() => claim(task)}>
                    {t('Забрать')}
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={checking} onClick={() => go(task)}>
                    {task.action === 'subscribe' ? (opened ? (checking ? t('Проверяем…') : t('Проверить')) : t('Подписаться')) : t('Перейти')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="note">{t('Подписку на канал бот проверяет сам. Задания с другом засчитываются, когда друг пополнит баланс.')}</p>
    </div>
  )
}
