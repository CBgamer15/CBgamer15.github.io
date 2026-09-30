import type { SVGProps } from 'react'

// Hand-picked stroke icons (1.5px) so the product doesn't look like a stock kit.
type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

export const IconClose = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
export const IconMinus = (p: P) => <svg {...base(p)}><path d="M5 12h14" /></svg>
export const IconArrowLeft = (p: P) => <svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>
export const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
export const IconCube = (p: P) => <svg {...base(p)}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
export const IconAr = (p: P) => <svg {...base(p)}><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M12 8l4 2.2v4.6L12 17l-4-2.2v-4.6L12 8z" /></svg>
export const IconBag = (p: P) => <svg {...base(p)}><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></svg>
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
export const IconLeaf = (p: P) => <svg {...base(p)}><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19l7-7" /></svg>
export const IconFlame = (p: P) => <svg {...base(p)}><path d="M12 21c-3.5 0-6-2.4-6-5.8 0-3.7 3.2-5.6 3.6-9.2 2.3 1.4 3.4 3.4 3.3 5.2 1-.6 1.8-1.7 2-3 1.8 1.6 3.1 4 3.1 6.8 0 3.6-2.5 6-6 6z" /></svg>
export const IconStar = (p: P) => <svg {...base(p)}><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4z" /></svg>
export const IconGlobe = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></svg>
export const IconNote = (p: P) => <svg {...base(p)}><path d="M5 4h10l4 4v12H5V4z" /><path d="M9 12h6M9 16h4" /></svg>
export const IconReceipt = (p: P) => <svg {...base(p)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></svg>
export const IconSparkle = (p: P) => <svg {...base(p)}><path d="M12 4l1.6 4.8L18 10.5l-4.4 1.7L12 17l-1.6-4.8L6 10.5l4.4-1.7L12 4zM18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" /></svg>

// Dashboard navigation
export const IconHome = (p: P) => <svg {...base(p)}><path d="M4 11l8-6.5 8 6.5V20h-5v-5H9v5H4v-9z" /></svg>
export const IconOrders = IconReceipt
export const IconFlameKitchen = (p: P) => <svg {...base(p)}><path d="M4 10h16v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9zM3 10h18M8 6c0-1 1-1 1-2M12 6c0-1 1-1 1-2M16 6c0-1 1-1 1-2" /></svg>
export const IconTable = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></svg>
export const IconMenuBook = (p: P) => <svg {...base(p)}><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5V5.5zM12 6v13.5" /></svg>
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="4" y="5.5" width="16" height="14" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>
export const IconChat = (p: P) => <svg {...base(p)}><path d="M5 5h14v10H10l-5 4V5z" /></svg>
export const IconChart = (p: P) => <svg {...base(p)}><path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" /></svg>
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.2a3 3 0 010 5.6M17.5 14.8c1.6.6 2.6 2 3 4.2" /></svg>
export const IconSettings = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>
export const IconExternal = (p: P) => <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
export const IconPrint = (p: P) => <svg {...base(p)}><path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2" /><path d="M7 14h10v6H7z" /></svg>
export const IconRefresh = (p: P) => <svg {...base(p)}><path d="M19 8a7.5 7.5 0 10.9 6M19 4v4h-4" /></svg>
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>
export const IconEdit = (p: P) => <svg {...base(p)}><path d="M5 19l1-4L16 5l3 3L9 18l-4 1z" /></svg>
export const IconEye = (p: P) => <svg {...base(p)}><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /></svg>
export const IconLogout = (p: P) => <svg {...base(p)}><path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l-4-4 4-4M6 12h9" /></svg>
export const IconBell = (p: P) => <svg {...base(p)}><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15L6 16zM10 20.5h4" /></svg>
export const IconSearch = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
export const IconMenu = (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
