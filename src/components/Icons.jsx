const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const CameraIcon = () => (
  <svg {...base}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const GridIcon = () => (
  <svg {...base}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>
)
export const TrophyIcon = () => (
  <svg {...base}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></svg>
)
export const KeyIcon = () => (
  <svg {...base}><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H20M17 12v3M20 12v2" /></svg>
)
export const FlipIcon = () => (
  <svg {...base}><path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4" /></svg>
)
export const UpIcon = () => (
  <svg {...base}><path d="M12 19V6M6 11l6-6 6 6" /></svg>
)
export const DownIcon = () => (
  <svg {...base}><path d="M12 5v13M6 13l6 6 6-6" /></svg>
)
export const HeartIcon = ({ filled }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
)
export const CloseIcon = () => (
  <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const ChevronIcon = ({ dir = 'right' }) => (
  <svg {...base} style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}><path d="M9 5l7 7-7 7" /></svg>
)
