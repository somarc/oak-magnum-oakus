<script setup lang="ts">
// Hero scope lines: what this guide is written for and what it is not (frontmatter `scope`).
import { useData } from 'vitepress'
import { VPLink } from 'vitepress/theme'

const { frontmatter } = useData()
</script>

<template>
  <dl v-if="frontmatter.scope" class="scope">
    <div class="line fit">
      <dt><span aria-hidden="true">✓</span><span class="sr">Written for</span></dt>
      <dd>{{ frontmatter.scope.fits.join(' · ') }}</dd>
    </div>
    <div class="line out">
      <dt><span aria-hidden="true">✗</span><span class="sr">Not for</span></dt>
      <dd>
        Not for {{ frontmatter.scope.excludes.join(' or ') }}
        <template v-if="frontmatter.scope.link">
          ·
          <VPLink class="version" :href="frontmatter.scope.link.href">{{ frontmatter.scope.link.text }} →</VPLink>
        </template>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.scope {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-top: 24px;
  font-size: 13.5px;
  line-height: 22px;
  font-weight: 500;
}

/* Inline, so the mark stays with its text when the hero centres it on small screens */
dt,
dd {
  display: inline;
  margin: 0;
}

dt {
  margin-right: 8px;
  font-weight: 700;
}

.fit dt {
  color: #4ade80;
}

.fit dd {
  color: rgba(255, 255, 255, 0.85);
}

.out dt {
  color: #f87171;
}

.out dd {
  color: rgba(255, 255, 255, 0.65);
}

.version {
  color: #86efac;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.version:hover {
  color: #bbf7d0;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
