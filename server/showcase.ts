import { createHash } from 'node:crypto'

export interface ShowcaseArtwork {
  code: string
  label: string
  model: string
  desc: string
  time: string
  html: string
}
export interface ShowcasePair { good: ShowcaseArtwork; bad: ShowcaseArtwork }

export function showcaseVersion(html: string) {
  return createHash('sha256').update(html).digest('hex').slice(0, 16)
}

export function showcaseWithPreviews(pairs: ShowcasePair[]) {
  return pairs.map((pair, index) => Object.fromEntries(
    (['good', 'bad'] as const).map(side => [side, {
      ...pair[side],
      previewImage: `/api/showcase/${index}/${side}/preview?v=${showcaseVersion(pair[side].html)}`,
    }]),
  ))
}
