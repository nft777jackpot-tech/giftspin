import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 20, ...rest }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...rest,
})

export function TonIcon({ size = 16, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...rest}>
      <circle cx="12" cy="12" r="12" fill="#0098ea" />
      <path d="M7.6 7.2h8.8c.8 0 1.3.9.9 1.6l-4.6 8a.8.8 0 0 1-1.4 0l-4.6-8c-.4-.7.1-1.6.9-1.6Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 7.4v9.8" stroke="#fff" strokeWidth="1.6" />
    </svg>
  )
}

export function StarIcon({ size = 16, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...rest}>
      <defs>
        <linearGradient id="star-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe17a" />
          <stop offset="1" stopColor="#ffa800" />
        </linearGradient>
      </defs>
      <path d="M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-6 3.3 1.3-6.6-4.9-4.6 6.7-.8L12 2.2Z" fill="url(#star-g)" />
    </svg>
  )
}

export const IconGames = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="7" width="19" height="11" rx="5.5" />
    <path d="M7 10.5v4M5 12.5h4" />
    <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" />
    <circle cx="17.5" cy="13.5" r=".6" fill="currentColor" />
  </svg>
)

export const IconBox = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5v-7Z" />
    <path d="M3.5 8.5 12 13l8.5-4.5M12 13v7" />
  </svg>
)

export const IconUpgrade = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20V9M7 13l5-5 5 5" />
    <path d="M5 4h14" />
  </svg>
)

export const IconBag = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="8" width="17" height="12" rx="2.5" />
    <path d="M12 8v12M3.5 12h17" />
    <path d="M12 8c-1.5-3.5-5.5-4-5.5-1.5S10 8 12 8Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 8 12 8Z" />
  </svg>
)

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" />
  </svg>
)

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconBack = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export const IconRocket = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 4.5c3-1 5-1 5-1s0 2-1 5l-6.5 6.5-4-4 6.5-6.5Z" />
    <path d="M8 11 5 10.5 3.5 12l4 1.5M13 16l.5 3L12 20.5 10.5 16.5" />
    <circle cx="15.5" cy="8.5" r="1.3" />
  </svg>
)

export const IconWheel = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 3.5V10M12 14v6.5M3.5 12H10M14 12h6.5" />
  </svg>
)

export const IconSwords = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
    <path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3" />
  </svg>
)

export const IconWallet = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" />
    <circle cx="16" cy="14" r="1.2" fill="currentColor" />
  </svg>
)

export const IconArrowUp = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
)

export const IconArrowDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
)

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const IconUsers = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5c.8-3.2 3.4-4.8 6.5-4.8s5.7 1.6 6.5 4.8" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.9c1.8.6 3 2 3.5 4.6" />
  </svg>
)

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const IconHelp = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 16.8v.2" />
  </svg>
)

export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z" />
  </svg>
)

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
)

export const IconGift = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5" />
    <path d="M12 8c-1.5-3.5-5.5-4-5.5-1.5S10 8 12 8Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 8 12 8Z" />
  </svg>
)

export const IconBolt = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
  </svg>
)

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const IconCoin = (p: P) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="12" rx="8.5" ry="8.5" />
    <ellipse cx="12" cy="12" rx="4.5" ry="8.5" />
  </svg>
)

export const IconBomb = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="14" r="6.5" />
    <path d="m15.5 9.5 2-2M17 5.5l1-1M19.5 7l1-.5M18.5 3.5V3" />
  </svg>
)

export const IconGem = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 4h12l3.5 5L12 20.5 2.5 9 6 4Z" />
    <path d="M2.5 9h19M9 4l-1.5 5L12 20.5 16.5 9 15 4" />
  </svg>
)

export const IconPlinko = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="1.2" fill="currentColor" />
    <circle cx="8.5" cy="10" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1.2" fill="currentColor" />
    <circle cx="5" cy="15" r="1.2" fill="currentColor" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    <circle cx="19" cy="15" r="1.2" fill="currentColor" />
    <path d="M3 20h18" />
  </svg>
)

export const IconDice = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" />
    <circle cx="15" cy="9" r="1.1" fill="currentColor" />
    <circle cx="9" cy="15" r="1.1" fill="currentColor" />
  </svg>
)

export const IconLayers = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
    <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
  </svg>
)

export const IconTrophy = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8 20.5h8M9.5 17.5h5v3h-5z" />
  </svg>
)

export const IconTasks = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="3.5" width="16" height="17" rx="3" />
    <path d="m8 9 1.5 1.5L12.5 7.5M8 15l1.5 1.5 3-3M14.5 9.5H17M14.5 15.5H17" />
  </svg>
)

export const IconShare = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M5 12v6.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V12" />
  </svg>
)

export const IconTicket = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5V6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2a3.5 3.5 0 0 0 0 7v2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-2a3.5 3.5 0 0 0 0-7Z" />
    <path d="M14 4.5v15" strokeDasharray="2 2.5" />
  </svg>
)

export const IconChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
)

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5M12 17.3v.2" />
  </svg>
)

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </svg>
)

export const IconMegaphone = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1Z" />
    <path d="M18.5 9a4 4 0 0 1 0 6M8 15l1 5h2.5l-1-4.5" />
  </svg>
)

export const IconCrown = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 10.5H5L3 8Z" />
  </svg>
)

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 11.5A8 8 0 0 0 6 6.5L4 8.5M4 4v4.5h4.5M4 12.5a8 8 0 0 0 14 5l2-2M20 20v-4.5h-4.5" />
  </svg>
)

export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 3.5 3 10.5l7 3 3 7 8-17Z" />
    <path d="m10 13.5 4.5-4.5" />
  </svg>
)

export const IconPalette = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.6-1.3-2.8 0-.9.7-1.5 1.6-1.5h2.2a4.2 4.2 0 0 0 4.2-4.2C20.5 6.6 16.7 3.5 12 3.5Z" />
    <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" />
    <circle cx="10" cy="7.5" r="1.1" fill="currentColor" />
    <circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" />
  </svg>
)
