import { createContentLoader } from 'vitepress'

// Words per page, keyed by page URL (no base, clean URLs), e.g. { '/architecture/segments': 483 }.
// Used by the home page table of contents for reading times and the corpus size.
export type WordCounts = Record<string, number>

declare const data: WordCounts
export { data }

export default createContentLoader('**/*.md', {
  includeSrc: true,
  transform(pages): WordCounts {
    return Object.fromEntries(
      pages.map(({ url, src = '' }) => {
        const text = src
          .replace(/^---[\s\S]*?\n---/, '') // frontmatter
          .replace(/```mermaid[\s\S]*?```/g, '') // diagrams are looked at, not read
          .replace(/<[^>]+>/g, ' ') // HTML and Vue components
        // Count tokens with a letter or digit, so table pipes and rules are not words.
        return [url, text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length]
      })
    )
  }
})
