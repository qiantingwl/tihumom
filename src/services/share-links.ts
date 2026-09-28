/// <reference types="vite/client" />
// The visible share link and the QR code must resolve to the same exact artwork(s).
export const PUBLIC_SITE_ORIGIN = import.meta.env?.VITE_PUBLIC_ORIGIN || 'https://www.tihu.mom'

export function artworkShareUrl(origin: string, id: string, otherId?: string) {
  const url = new URL(otherId ? '/compare' : '/gallery', origin)
  if (otherId) {
    url.searchParams.set('left', id)
    url.searchParams.set('right', otherId)
  } else url.searchParams.set('item', id)
  return url.toString()
}
