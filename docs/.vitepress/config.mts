import { defineConfig } from 'vitepress'

// Emoji (including ZWJ sequences) inside h1 headings; see the h1 gradient in custom.css.
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu

export default defineConfig({
    title: "The Magnum OAKus",
    description: "Production-grade recovery procedures for Apache Oak SegmentStore (TarMK)",
    
    base: '/oak-magnum-oakus/', // GitHub Pages deployment
    cleanUrls: true,
    appearance: 'force-dark', // diagrams and custom styles are designed for dark only
    ignoreDeadLinks: true,
    
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/oak-magnum-oakus/oak-tree.svg' }],
      ['meta', { name: 'theme-color', content: '#0a1628' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:title', content: 'The Magnum OAKus' }],
      ['meta', { property: 'og:description', content: 'Production-grade recovery procedures for Apache Oak SegmentStore' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ],

    themeConfig: {
      logo: '/oak-tree.svg',
      siteTitle: 'Magnum OAKus',
      
      nav: [
        { text: 'Home', link: '/' },
        { text: '🚨 Crisis', link: '/crisis/' },
        { text: '🏗️ Architecture', link: '/architecture/' },
        { text: '🛠️ Recovery', link: '/recovery/' },
        { text: '📋 Checkpoints', link: '/checkpoints/' },
        { text: '📚 Reference', link: '/reference/' },
        { text: '🎯 Oak Versions', link: '/reference/oak-versions' },
      ],

      sidebar: {
        '/': [
          {
            text: '🚨 Emergency Response',
            collapsed: false,
            items: [
              { text: 'Crisis Checklist', link: '/crisis/' },
              { text: 'Quick Reference', link: '/crisis/quick-reference' },
              { text: 'Decision Tree', link: '/crisis/decision-tree' },
              { text: 'Identify Repo Type', link: '/crisis/identify-repo' },
            ]
          },
          {
            text: '🏗️ Architecture',
            collapsed: false,
            items: [
              { text: 'Overview', link: '/architecture/' },
              { text: 'Segments', link: '/architecture/segments' },
              { text: 'TAR Files', link: '/architecture/tar-files' },
              { text: 'Journal', link: '/architecture/journal' },
              { text: 'Generational GC', link: '/architecture/gc' },
            ]
          },
          {
            text: '🛠️ Recovery Operations',
            collapsed: false,
            items: [
              { text: 'Recovery Options', link: '/recovery/' },
              { text: '🚨 SNFE Playbook', link: '/recovery/snfe-playbook' },
              { text: 'oak-run check', link: '/recovery/check' },
              { text: 'Journal Recovery', link: '/recovery/journal' },
              { text: 'Surgical Removal', link: '/recovery/surgical' },
              { text: 'Compaction', link: '/recovery/compaction' },
              { text: 'Sidegrade', link: '/recovery/sidegrade' },
              { text: 'Pre-Text Extraction', link: '/recovery/pre-text-extraction' },
            ]
          },
          {
            text: '📋 Checkpoints',
            collapsed: false,
            items: [
              { text: 'Understanding Checkpoints', link: '/checkpoints/' },
              { text: 'Disk Bloat', link: '/checkpoints/disk-bloat' },
              { text: 'Async Indexing', link: '/checkpoints/async-indexing' },
              { text: 'Death Loop', link: '/checkpoints/death-loop' },
              { text: 'Checkpoint Advancement', link: '/checkpoints/checkpoint-advancement' },
            ]
          },
          {
            text: '💾 DataStore',
            collapsed: true,
            items: [
              { text: 'DataStore Tools', link: '/datastore/' },
              { text: 'Consistency Check', link: '/datastore/consistency' },
              { text: 'Garbage Collection', link: '/datastore/gc' },
            ]
          },
          {
            text: '📚 Reference',
            collapsed: true,
            items: [
              { text: 'Command Reference', link: '/reference/' },
              { text: 'Oak Version Scope', link: '/reference/oak-versions' },
              { text: 'count-nodes', link: '/reference/count-nodes' },
              { text: 'Console Commands', link: '/reference/console' },
              { text: 'Troubleshooting', link: '/reference/troubleshooting' },
            ]
          },
        ],
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/somarc/oak-magnum-oakus' }
      ],

      footer: {
        message: 'Apache 2.0 Licensed',
        copyright: '🌳 Oak: The foundation of enterprise content'
      },

      search: {
        provider: 'local'
      },

      editLink: {
        pattern: 'https://github.com/somarc/oak-magnum-oakus/edit/main/docs/:path',
        text: 'Edit this page'
      },

      outline: {
        level: [2, 3],
        label: 'On this page'
      }
    },

    markdown: {
      lineNumbers: true,
      theme: {
        light: 'github-light',
        dark: 'github-dark'
      },
      config(md) {
        // ```mermaid fences render client-side in <MermaidDiagram> (theme/components).
        const fence = md.renderer.rules.fence!
        md.renderer.rules.fence = (tokens, idx, options, env, self) => {
          const token = tokens[idx]
          if (token.info.trim() === 'mermaid') {
            return `<MermaidDiagram code="${encodeURIComponent(token.content)}" />`
          }
          return fence(tokens, idx, options, env, self)
        }

        // Wrap emoji in h1 so the gradient text fill does not flatten them.
        // Runs after the anchor plugin, so slugs and page titles are unchanged.
        md.core.ruler.push('oak_h1_emoji', (state) => {
          const token = (type: string, content: string) => {
            const t = new state.Token(type, '', 0)
            t.content = content
            return t
          }
          state.tokens.forEach((open, i) => {
            const inline = state.tokens[i + 1]
            if (open.type !== 'heading_open' || open.tag !== 'h1' || !inline?.children) return
            inline.children = inline.children.flatMap((child) => {
              if (child.type !== 'text') return [child]
              const parts = []
              let last = 0
              for (const match of child.content.matchAll(EMOJI)) {
                if (match.index > last) parts.push(token('text', child.content.slice(last, match.index)))
                parts.push(
                  token('html_inline', '<span class="h1-emoji">'),
                  token('text', match[0]),
                  token('html_inline', '</span>')
                )
                last = match.index + match[0].length
              }
              if (!parts.length) return [child]
              if (last < child.content.length) parts.push(token('text', child.content.slice(last)))
              return parts
            })
          })
        })
      }
    }
})
