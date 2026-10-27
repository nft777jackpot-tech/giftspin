import { useEffect } from 'react'

interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

interface TgWebApp {
  version: string
  platform: string
  initData: string
  initDataUnsafe: { user?: TgUser; start_param?: string }
  isVersionAtLeast(v: string): boolean
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  disableVerticalSwipes?(): void
  openTelegramLink(url: string): void
  openLink(url: string): void
  shareToStory?(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void
  switchInlineQuery?(query: string, chooseChatTypes?: ('users' | 'bots' | 'groups' | 'channels')[]): void
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  BackButton: {
    show(): void
    hide(): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

const webApp = window.Telegram?.WebApp
/** Объект Telegram есть и в обычном браузере, но там initData пустой. */
export const tg = webApp && webApp.initData ? webApp : undefined

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()
}

/** Цвет шапки и нижней панели Telegram под тон фона. */
export function setTgChrome(color: string) {
  if (!tg) return
  if (tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor(color)
    tg.setBackgroundColor(color)
  }
  if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.(color)
}

const canHaptic = () => !!tg && tg.isVersionAtLeast('6.1')

export const haptic = {
  tap: () => canHaptic() && tg!.HapticFeedback.impactOccurred('light'),
  heavy: () => canHaptic() && tg!.HapticFeedback.impactOccurred('heavy'),
  select: () => canHaptic() && tg!.HapticFeedback.selectionChanged(),
  success: () => canHaptic() && tg!.HapticFeedback.notificationOccurred('success'),
  error: () => canHaptic() && tg!.HapticFeedback.notificationOccurred('error'),
}

export interface Me {
  /** Пусто в браузере: интерфейс подставит «Гость». */
  name: string
  username?: string
  photo?: string
  id?: number
}

export function getMe(): Me {
  const u = tg?.initDataUnsafe.user
  if (!u) return { name: '', username: 'demo_player' }
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    username: u.username,
    photo: u.photo_url,
  }
}

/** Нативная кнопка «Назад» в шапке Telegram. В браузере ничего не делает. */
export function useBackButton(onBack: (() => void) | null) {
  useEffect(() => {
    if (!tg || !onBack || !tg.isVersionAtLeast('6.1')) return
    tg.BackButton.show()
    tg.BackButton.onClick(onBack)
    return () => {
      tg.BackButton.offClick(onBack)
      tg.BackButton.hide()
    }
  }, [onBack])
}

/** Ссылка на t.me: в Telegram открывается внутри клиента, в браузере в новой вкладке. */
export function openTg(url: string) {
  if (tg) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}

export const canShareStory = () => !!tg?.shareToStory && tg.isVersionAtLeast('7.8')

/** Сторис с картинкой подарка. Ссылка-виджет видна только у Premium, но не мешает остальным. */
export function shareStory(mediaUrl: string, text: string, link: string, linkName: string) {
  tg?.shareToStory?.(mediaUrl, { text, widget_link: { url: link, name: linkName } })
}

/**
 * Отправка в чат. В Telegram открывается выбор чата с инлайн-запросом к боту, бот подставит
 * карточку с кнопкой. Без инлайн-режима и в браузере — обычная ссылка t.me/share.
 */
export function shareToChat(inlineQuery: string, text: string, url: string) {
  if (tg?.switchInlineQuery && tg.isVersionAtLeast('6.7')) {
    tg.switchInlineQuery(inlineQuery, ['users', 'groups', 'channels'])
    return
  }
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  openTg(link)
}

export function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {})
}
