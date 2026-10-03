import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'
import OakFlowGraph from './components/OakFlowGraph.vue'
import MermaidDiagram from './components/MermaidDiagram.vue'
import HomeScope from './components/HomeScope.vue'
import HomeIncident from './components/HomeIncident.vue'
import HomeCorpus from './components/HomeCorpus.vue'

export default {
  extends: DefaultTheme,
  // Home page lanes render from index.md frontmatter (scope, incident, corpus).
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-actions-after': () => h(HomeScope),
      'home-hero-after': () => [h(HomeIncident), h(HomeCorpus)]
    }),
  enhanceApp({ app }) {
    // Register global components for Oak visualizations
    app.component('OakFlowGraph', OakFlowGraph)
    app.component('MermaidDiagram', MermaidDiagram)
  }
} satisfies Theme
