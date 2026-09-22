// What the browser itself says about the page — the tab title, the icon next
// to it, and the card another app draws when someone shares the link. On a
// partner's own domain all of that has to carry the partner's name, not the
// platform's, so it is rewritten from the branding that owns the host.
//
// index.html ships the platform's own title and icon; this only replaces them
// when a brand claims the domain, so the default is what a visitor sees
// anywhere else, and also while the lookup is in flight.

import { brandingAPI } from '../services/api'

function setMeta(attr, key, content) {
  if (!content) return
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setIcon(rel, href) {
  if (!href) return
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove())
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  document.head.appendChild(link)
}

export function applyBranding(branding) {
  if (!branding) return
  const name = (branding.companyName || '').trim()
  const icon = branding.companyIcon || branding.companyLogo || null

  if (name) {
    document.title = name
    setMeta('property', 'og:title', name)
    setMeta('property', 'og:site_name', name)
    setMeta('name', 'application-name', name)
    setMeta('name', 'apple-mobile-web-app-title', name)
    if (branding.companyTagline) {
      setMeta('name', 'description', branding.companyTagline)
      setMeta('property', 'og:description', branding.companyTagline)
    }
  }

  if (icon) {
    // The tab icon, the icon a phone saves to its home screen, and the picture
    // in a shared link's preview.
    setIcon('icon', icon)
    setIcon('shortcut icon', icon)
    setIcon('apple-touch-icon', icon)
    setMeta('property', 'og:image', icon)
    setMeta('name', 'twitter:image', icon)
    setMeta('name', 'twitter:card', 'summary')
  }
}

// Reads the brand that owns the current domain and applies it. Safe to call on
// every boot: on a domain nobody claims it leaves the page untouched.
export async function applyHostBranding() {
  try {
    const { data } = await brandingAPI.getByHost(window.location.host)
    applyBranding(data?.branding)
    return data?.branding || null
  } catch {
    return null // the platform's own title and icon stay
  }
}
