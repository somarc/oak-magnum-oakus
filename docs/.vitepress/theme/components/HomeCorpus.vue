<script setup lang="ts">
// Home lane for the reader who has time (frontmatter `corpus`): the guide as a
// table of contents. Chapters come from the sidebar, so new pages appear here
// automatically; word counts are measured at build time.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { VPLink } from 'vitepress/theme'
import { data as wordCounts } from '../word-counts.data'

type SidebarItem = { text?: string; link?: string; items?: SidebarItem[] }

const { frontmatter, theme } = useData()

const WORDS_PER_MINUTE = 200
const EMOJI = /^\p{Extended_Pictographic}\uFE0F?\s*/u
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function flatten(items: SidebarItem[] = []): SidebarItem[] {
  return items.flatMap((item) => [item, ...flatten(item.items)])
}

const parts = computed(() => {
  const sidebar = theme.value.sidebar ?? {}
  const groups: SidebarItem[] = Array.isArray(sidebar) ? sidebar : Object.values(sidebar).flat()
  const links = flatten(groups).filter((item) => item.link)

  return (frontmatter.value.corpus?.parts ?? []).map((part: any, i: number) => {
    const chapters = links
      .filter((item) => item.link!.startsWith(part.prefix))
      .map((item) => {
        const words = wordCounts[item.link!] ?? 0
        return {
          text: item.text!.replace(EMOJI, ''),
          link: item.link!,
          words,
          minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE))
        }
      })
    return {
      ...part,
      numeral: ROMAN[i] ?? String(i + 1),
      chapters,
      minutes: chapters.reduce((sum, c) => sum + c.minutes, 0)
    }
  })
})

const totals = computed(() => {
  const chapters = parts.value.reduce((sum, p) => sum + p.chapters.length, 0)
  const words = parts.value.reduce(
    (sum, p) => sum + p.chapters.reduce((s, c) => s + c.words, 0),
    0
  )
  const rounded = words >= 10000 ? Math.round(words / 1000) * 1000 : Math.round(words / 100) * 100
  return { chapters, words: rounded.toLocaleString('en-US') }
})
</script>

<template>
  <section v-if="frontmatter.corpus" id="corpus" class="lane" aria-labelledby="corpus-title">
    <header class="lane-head">
      <p class="kicker">{{ frontmatter.corpus.kicker }}</p>
      <h2 id="corpus-title">{{ frontmatter.corpus.title }}</h2>
      <p class="lede">{{ frontmatter.corpus.lede }}</p>
      <p class="stats">
        {{ parts.length }} parts · {{ totals.chapters }} chapters · about {{ totals.words }} words
      </p>
    </header>

    <div class="toc">
      <section v-for="part in parts" :key="part.prefix" class="part">
        <div class="part-head">
          <p class="part-no">Part {{ part.numeral }} · {{ part.minutes }} min</p>
          <h3>
            <VPLink :href="part.chapters[0]?.link">{{ part.title }}</VPLink>
          </h3>
          <p class="blurb">{{ part.blurb }}</p>
        </div>
        <ol class="chapters">
          <li v-for="chapter in part.chapters" :key="chapter.link">
            <VPLink :href="chapter.link">
              <span class="title">{{ chapter.text }}</span>
              <span class="leader" aria-hidden="true" />
              <span class="min">{{ chapter.minutes }} min</span>
            </VPLink>
          </li>
        </ol>
      </section>
    </div>

    <VPLink v-if="parts[0]?.chapters[0]" class="start" :href="parts[0].chapters[0].link">
      Start with Part I: {{ parts[0].title }} →
    </VPLink>
  </section>
</template>

<style scoped>
.lane {
  margin: 0 auto;
  max-width: 1280px;
  padding: 96px 24px 0;
}

@media (min-width: 640px) {
  .lane {
    padding: 112px 48px 0;
  }
}

@media (min-width: 960px) {
  .lane {
    padding: 128px 64px 0;
  }
}

.lane-head {
  max-width: 720px;
  margin-bottom: 40px;
}

.kicker {
  margin: 0 0 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4ade80;
}

.lane-head h2 {
  margin: 0;
  font-size: 28px;
  line-height: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
}

@media (min-width: 960px) {
  .lane-head h2 {
    font-size: 32px;
    line-height: 40px;
  }
}

.lede {
  margin: 12px 0 0;
  font-size: 17px;
  line-height: 28px;
  color: var(--vp-c-text-2);
}

.stats {
  margin: 12px 0 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: #86efac;
}

/* A book's table of contents: one row per part */
.toc {
  margin-bottom: 40px;
  border-bottom: 1px solid rgba(74, 222, 128, 0.25);
}

.part {
  display: grid;
  gap: 12px;
  border-top: 1px solid rgba(74, 222, 128, 0.25);
  padding: 24px 0 28px;
}

@media (min-width: 960px) {
  .part {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 56px;
  }
}

.part-no {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4ade80;
}

.part h3 {
  margin: 4px 0 0;
  font-size: 22px;
  line-height: 30px;
  font-weight: 700;
}

.part h3 .VPLink {
  color: var(--vp-c-text-1);
}

.part h3 .VPLink:hover {
  color: #86efac;
}

.blurb {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}

.chapters {
  align-self: start;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 640px) {
  .chapters {
    columns: 2;
    column-gap: 40px;
  }

  .chapters li {
    break-inside: avoid;
  }
}

@media (min-width: 960px) {
  .chapters {
    padding-top: 22px;
  }
}

.chapters .VPLink {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  font-size: 15px;
  line-height: 22px;
  color: var(--vp-c-text-1);
}

.chapters .VPLink:hover .title {
  color: #86efac;
}

.leader {
  flex: 1;
  min-width: 16px;
  border-bottom: 1px dotted rgba(255, 255, 255, 0.25);
  transform: translateY(-4px);
}

.min {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.start {
  display: inline-block;
  border: 1px solid rgba(74, 222, 128, 0.45);
  border-radius: 999px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #86efac;
}

.start:hover {
  border-color: #4ade80;
  background: rgba(74, 222, 128, 0.08);
}
</style>
