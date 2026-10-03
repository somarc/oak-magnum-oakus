<script setup lang="ts">
// Home lane for the reader in an incident (frontmatter `incident`):
// the laminated crisis card, symptom tiles, and repository size → time band.
import { ref } from 'vue'
import { useData } from 'vitepress'
import { VPLink } from 'vitepress/theme'

const { frontmatter } = useData()

const copied = ref('')
async function copy(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    copied.value = command
    setTimeout(() => copied.value === command && (copied.value = ''), 1800)
  } catch {
    copied.value = ''
  }
}
</script>

<template>
  <section v-if="frontmatter.incident" id="incident" class="lane" aria-labelledby="incident-title">
    <header class="lane-head">
      <p class="kicker">{{ frontmatter.incident.kicker }}</p>
      <h2 id="incident-title">{{ frontmatter.incident.title }}</h2>
    </header>

    <div class="grid">
      <article class="card" aria-labelledby="card-title">
        <header class="card-head">
          <p class="card-note">{{ frontmatter.incident.card.note }}</p>
          <h3 id="card-title">{{ frontmatter.incident.card.title }}</h3>
        </header>

        <ol class="steps">
          <li v-for="(step, i) in frontmatter.incident.card.steps" :key="step.title" class="step">
            <span class="box" aria-hidden="true">{{ i + (frontmatter.incident.card.start ?? 1) }}</span>
            <div class="step-body">
              <VPLink class="step-title" :href="step.link">{{ step.title }}</VPLink>
              <p v-if="step.body" v-html="step.body" />
              <div v-if="step.command" class="cmd paper">
                <code>{{ step.command }}</code>
                <button type="button" @click="copy(step.command)">
                  {{ copied === step.command ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <ul v-if="step.outcomes" class="outcomes">
                <li v-for="o in step.outcomes" :key="o.signal" :class="o.tone">
                  <code>{{ o.signal }}</code>
                  <span>→ {{ o.action }}</span>
                </li>
              </ul>
            </div>
          </li>
        </ol>

        <footer class="never">
          <strong>Never</strong>
          <span v-html="frontmatter.incident.card.never.text" />
          <VPLink :href="frontmatter.incident.card.never.link">{{ frontmatter.incident.card.never.more }}</VPLink>
        </footer>
      </article>

      <div class="signals">
        <h3>{{ frontmatter.incident.symptoms.title }}</h3>
        <ul class="tiles">
          <li v-for="s in frontmatter.incident.symptoms.items" :key="s.signal">
            <component
              :is="s.link ? VPLink : 'div'"
              :href="s.link"
              class="tile"
              :class="{ calm: s.tone === 'calm' }"
            >
              <span class="signal" :class="{ log: s.log }">{{ s.signal }}</span>
              <span class="cause">{{ s.cause }}</span>
              <span class="dest">{{ s.dest }}<template v-if="s.link"> →</template></span>
            </component>
          </li>
        </ul>

        <div class="sizes">
          <h3>{{ frontmatter.incident.sizes.title }}</h3>
          <p class="sizes-lede">{{ frontmatter.incident.sizes.lede }}</p>
          <div class="cmd">
            <code>{{ frontmatter.incident.sizes.command }}</code>
            <button type="button" @click="copy(frontmatter.incident.sizes.command)">
              {{ copied === frontmatter.incident.sizes.command ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <ol class="scale">
            <li v-for="r in frontmatter.incident.sizes.rows" :key="r.size">
              <span class="size">{{ r.size }}</span>
              <span class="time">{{ r.time }}</span>
            </li>
          </ol>
          <p class="sizes-note">
            {{ frontmatter.incident.sizes.note }}
            <VPLink :href="frontmatter.incident.sizes.link.href">{{ frontmatter.incident.sizes.link.text }} →</VPLink>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lane {
  margin: 0 auto;
  max-width: 1280px;
  padding: 24px 24px 0;
}

@media (min-width: 640px) {
  .lane {
    padding: 32px 48px 0;
  }
}

@media (min-width: 960px) {
  .lane {
    padding: 32px 64px 0;
  }
}

.lane-head {
  margin-bottom: 28px;
}

.kicker {
  margin: 0 0 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f87171;
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

.grid {
  display: grid;
  gap: 40px;
}

@media (min-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
  }
}

/* The laminated card: printed paper, taped to the monitor */
.card {
  position: relative;
  border-radius: 6px;
  padding: 28px 20px 20px;
  background:
    linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.45) 46%, transparent 54%) no-repeat,
    #f3efe6;
  color: #1c1917;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.6) inset,
    0 24px 48px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(0, 0, 0, 0.4);
}

@media (min-width: 640px) {
  .card {
    padding: 32px 32px 24px;
  }
}

.card::before,
.card::after {
  content: '';
  position: absolute;
  top: -12px;
  width: 92px;
  height: 26px;
  background: rgba(236, 228, 205, 0.72);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.card::before {
  left: 18px;
  transform: rotate(-4deg);
}

.card::after {
  right: 18px;
  transform: rotate(3deg);
}

.card-note {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #b91c1c;
}

.card-head h3 {
  margin: 4px 0 0;
  padding-bottom: 14px;
  border-bottom: 2px solid #1c1917;
  font-size: 24px;
  line-height: 32px;
  font-weight: 700;
  color: #1c1917;
}

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px dashed rgba(28, 25, 23, 0.25);
}

.box {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid #1c1917;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 700;
}

.step-title {
  font-size: 17px;
  line-height: 28px;
  font-weight: 700;
  color: #1c1917;
  text-decoration: underline;
  text-decoration-color: rgba(185, 28, 28, 0.45);
  text-underline-offset: 4px;
}

.step-title:hover {
  color: #b91c1c;
  text-decoration-color: currentColor;
}

.step-body p {
  margin: 2px 0 0;
  font-size: 14.5px;
  line-height: 22px;
  color: #44403c;
}

.step-body :deep(strong) {
  color: #b91c1c;
}

.step-body p :deep(code),
.never :deep(code) {
  border-radius: 3px;
  padding: 1px 4px;
  background: rgba(28, 25, 23, 0.07);
  font-family: var(--vp-font-family-mono);
  font-size: 0.86em;
  color: #1c1917;
  white-space: nowrap;
}

.outcomes {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.outcomes li {
  display: grid;
  gap: 2px;
  border-left: 3px solid;
  padding: 2px 0 2px 10px;
  font-size: 13.5px;
  line-height: 20px;
}

.outcomes code {
  padding: 0;
  background: none;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: #292524;
}

.outcomes span {
  font-weight: 600;
}

.outcomes .good {
  border-color: #15803d;
}

.outcomes .good span {
  color: #15803d;
}

.outcomes .warn {
  border-color: #b45309;
}

.outcomes .warn span {
  color: #b45309;
}

.outcomes .bad {
  border-color: #b91c1c;
}

.outcomes .bad span {
  color: #b91c1c;
}

.never {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin-top: 16px;
  font-size: 14px;
  line-height: 22px;
  color: #44403c;
}

.never strong {
  border-radius: 3px;
  padding: 0 6px;
  background: #b91c1c;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #fff;
}

.never .VPLink {
  font-weight: 600;
  color: #b91c1c;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Copyable commands */
.cmd {
  display: flex;
  align-items: stretch;
  margin-top: 8px;
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: 6px;
  background: #020617;
  overflow: hidden;
}

.cmd code {
  flex: 1;
  padding: 8px 12px;
  background: none;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 20px;
  color: #e2e8f0;
  overflow-wrap: anywhere;
}

.cmd button {
  flex-shrink: 0;
  border-left: 1px solid rgba(74, 222, 128, 0.2);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: #86efac;
}

.cmd button:hover {
  background: rgba(74, 222, 128, 0.1);
}

.cmd.paper {
  border-color: #1c1917;
  background: #1c1917;
}

.cmd.paper button {
  border-left-color: rgba(255, 255, 255, 0.15);
  color: #fde68a;
}

/* Symptom tiles */
.signals h3 {
  margin: 0 0 14px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.tiles {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 640px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tiles li:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}

.tiles li {
  display: flex;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid rgba(248, 113, 113, 0.55);
  border-radius: 8px;
  padding: 14px 16px;
  background: #0a1628;
  color: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}

a.tile:hover {
  border-color: rgba(248, 113, 113, 0.5);
  border-left-color: #f87171;
  background: #0f1d33;
}

.signal {
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.signal.log {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: #fecaca;
  overflow-wrap: anywhere;
}

.cause {
  flex: 1;
  font-size: 14px;
  line-height: 20px;
  color: var(--vp-c-text-2);
}

.dest {
  font-size: 13px;
  font-weight: 600;
  color: #f87171;
}

.tile.calm {
  border-left-color: #f59e0b;
}

.tile.calm .signal.log {
  color: #fde68a;
}

.tile.calm .dest {
  color: #fbbf24;
}

/* Repository size → time */
.sizes {
  margin-top: 32px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 24px;
  background: #0a1628;
}

.signals .sizes h3 {
  margin-bottom: 4px;
}

.sizes-lede {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}

.scale {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 20px 0 0;
  padding: 6px 0 0;
  list-style: none;
  background: linear-gradient(90deg, #4ade80, #f59e0b 55%, #ef4444) top / 100% 4px no-repeat;
}

.scale li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px 0 0;
}

.scale li + li {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  padding-left: 10px;
}

.size {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.time {
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}

@media (max-width: 639px) {
  .scale {
    grid-template-columns: 1fr;
    padding: 0 0 0 14px;
    background: linear-gradient(180deg, #4ade80, #f59e0b 55%, #ef4444) left / 4px 100% no-repeat;
  }

  .scale li,
  .scale li + li {
    flex-direction: row;
    justify-content: space-between;
    gap: 12px;
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding: 8px 0;
  }

  .scale li:first-child {
    border-top: 0;
  }

  .time {
    text-align: right;
  }
}

.sizes-note {
  margin: 16px 0 0;
  font-size: 13.5px;
  line-height: 21px;
  color: var(--vp-c-text-2);
}

.sizes-note .VPLink {
  font-weight: 600;
  color: #86efac;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
