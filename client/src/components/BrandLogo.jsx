import { useState } from 'react'
import { DEFAULT_BRAND_FULL_LOGO } from '../utils/hostBranding'

// The platform's own logo, animated: the "N" pops in, the "EBO AI" lettering
// is revealed left to right, then a metallic glint crosses it every few
// seconds. Hovering replays the entrance. The image is drawn twice and each
// copy is clipped to one half so the two parts can move on their own.
// Styles live in index.css (.brand-logo); in dark mode the logo is inverted so
// its black outline stays visible.
export default function BrandLogo({ width = 116, className = '' }) {
  const [run, setRun] = useState(0)

  return (
    <div
      key={run}
      className={`brand-logo ${className}`}
      style={{ width }}
      onMouseEnter={() => setRun((n) => n + 1)}
      role="img"
      aria-label="NEBO AI"
    >
      <img className="brand-logo-n" src={DEFAULT_BRAND_FULL_LOGO} alt="" draggable="false" />
      <img className="brand-logo-t" src={DEFAULT_BRAND_FULL_LOGO} alt="" draggable="false" />
      <span className="brand-logo-shine" />
    </div>
  )
}
