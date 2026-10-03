<script setup lang="ts">
import { onMounted, ref } from 'vue'

// Renders one ```mermaid fence (see markdown.config in config.mts).
// Mermaid draws into this component's own element, so a failed render can never
// leave temporary nodes in <body> that survive client-side navigation.
const props = defineProps<{ code: string }>()

const MIN_SCALE = 0.75 // below this, scroll horizontally instead of shrinking the text

const host = ref<HTMLElement>()
const error = ref('')
const source = decodeURIComponent(props.code)

onMounted(async () => {
  const el = host.value!
  try {
    const mermaid = await loadMermaid()
    const { svg } = await mermaid.render(`oak-mermaid-${++renderCount}`, source, el)
    el.innerHTML = svg
    const svgEl = el.querySelector('svg')
    const width = svgEl?.viewBox.baseVal?.width
    if (svgEl && width) svgEl.style.minWidth = `${Math.round(width * MIN_SCALE)}px`
  } catch (e) {
    el.innerHTML = ''
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<script lang="ts">
let renderCount = 0
let mermaidPromise: Promise<typeof import('mermaid').default> | undefined

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      suppressErrorRendering: true,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#4ade80',
        primaryTextColor: '#fff',
        primaryBorderColor: '#22c55e',
        lineColor: '#4ade80',
        secondaryColor: '#0a1628',
        tertiaryColor: '#0f2847',
        background: '#030712',
        mainBkg: '#0a1628',
        nodeBorder: '#4ade80',
      },
    })
    return mermaid
  })
  return mermaidPromise
}
</script>

<template>
  <div class="mermaid-diagram">
    <div ref="host" class="mermaid-diagram-host" />
    <div v-if="error" class="mermaid-diagram-error">
      <p>Diagram failed to render: {{ error }}</p>
      <pre><code>{{ source }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.mermaid-diagram {
  margin: 16px 0;
  overflow-x: auto;
}

.mermaid-diagram-host {
  text-align: center;
}

.mermaid-diagram-error {
  border: 1px solid var(--oak-danger);
  border-radius: 8px;
  padding: 12px 16px;
}

.mermaid-diagram-error p {
  margin: 0 0 8px;
  color: var(--oak-danger);
}

.mermaid-diagram-error pre {
  margin: 0;
  overflow-x: auto;
  font-size: 13px;
}
</style>
