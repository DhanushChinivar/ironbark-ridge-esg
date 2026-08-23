<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { computed } from 'vue';
import { api } from './api';
import { useAsync } from './composables/useAsync';

const route = useRoute();

// Each section gets a glyph as well as a word. At sidebar width the label is
// what identifies it; the glyph is what you find again without reading.
const nav = [
  { to: '/', label: 'Overview', icon: 'grid' },
  { to: '/emissions', label: 'Emissions', icon: 'cloud' },
  { to: '/safety', label: 'Safety', icon: 'hat' },
  { to: '/data-trust', label: 'Data trust', icon: 'layers' },
] as const;

// Kept apart from the four above. Those are places to look at the data; this is
// something the data is turned into, and grouping it with them would suggest a
// fifth screen rather than an output.
const output = { to: '/report', label: 'Report' } as const;

const quality = useAsync(() => api.dataQuality());

const rows = computed(() =>
  (quality.data.value?.files ?? []).reduce((a, f) => a + f.rowsRead, 0),
);
const rejected = computed(() =>
  (quality.data.value?.files ?? []).reduce((a, f) => a + f.rowsRejected, 0),
);
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand">
        <!-- The brand mark itself, not a redrawing of it. The ridge, leaf and
             shield do not survive being simplified to three paths, and this is
             the same file the favicon uses. -->
        <img class="mark" src="/icon-512.png" alt="" width="34" height="34" />
        <div>
          <div class="eyebrow">Ironbark Ridge</div>
          <div class="site sans">ESG &amp; Safety</div>
        </div>
      </div>

      <nav>
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="sans"
          :class="{ on: route.path === item.to }"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="item.icon === 'grid'">
              <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
            </template>
            <!-- The reference art letters this CO2; at 18px the letterforms
                 close into blobs. Cloud plus horizontal air strokes carries the
                 same meaning - vertical wisps just read as rain. -->
            <template v-else-if="item.icon === 'cloud'">
              <path d="M7.4 15.6a3.8 3.8 0 0 1-.4-7.6 5.1 5.1 0 0 1 9.7-.6 3.6 3.6 0 0 1 .4 7.2Z" />
              <path d="M5.4 18.8h9.2M8.6 21.4h7" />
            </template>
            <!-- Crown, brim, and the two ribs that stop a dome reading as a
                 lamp. Anything finer than this is lost by 18px. -->
            <template v-else-if="item.icon === 'hat'">
              <path d="M6 14.8V12a6 6 0 0 1 12 0v2.8" />
              <path d="M12 14.6V6.1" />
              <path d="M2.8 14.8h18.4a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1Z" />
            </template>
            <template v-else>
              <path d="M12 3 3 7.5 12 12l9-4.5Z" />
              <path d="m3 12.5 9 4.5 9-4.5" />
            </template>
          </svg>
          <span>{{ item.label }}</span>
        </RouterLink>

        <RouterLink
          :to="output.to"
          class="sans out"
          :class="{ on: route.path === output.to }"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h4" />
          </svg>
          <span>{{ output.label }}</span>
          <span class="tag mono">PDF</span>
        </RouterLink>
      </nav>

      <!-- The one fact the whole app rests on, kept in view on every screen. -->
      <div class="field">
        <div class="eyebrow">Reporting period</div>
        <div class="period mono">Jan 2025 – Jun 2026</div>
        <div class="bar" aria-hidden="true"><span /></div>
        <dl class="tally mono">
          <div><dt>rows read</dt><dd>{{ rows || '—' }}</dd></div>
          <div><dt>discarded</dt><dd :class="{ zero: rejected === 0 }">{{ rejected }}</dd></div>
        </dl>
      </div>
    </aside>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; align-items: flex-start; gap: 0; }

aside {
  position: sticky;
  top: 20px;
  margin: 20px 0 20px 20px;
  flex: 0 0 244px;
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 22px 18px;
  height: calc(100vh - 40px);
  background: var(--panel);
  -webkit-backdrop-filter: var(--glass);
  backdrop-filter: var(--glass);
  border: 1px solid var(--panel-edge);
  border-radius: 24px;
  box-shadow: var(--lift-high);
}

.brand { display: flex; align-items: center; gap: 11px; padding: 4px 6px; }
/* The artwork carries its own gradient and rounded corners; the radius here
   only clips the sheet background left in the crop. */
.mark {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  box-shadow: 0 3px 10px -2px rgba(37, 106, 191, 0.45);
}
.site { font-weight: 800; font-size: 15.5px; letter-spacing: -0.02em; line-height: 1.2; }

nav { display: flex; flex-direction: column; gap: 3px; }
nav a {
  display: flex;
  align-items: center;
  gap: 11px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
  padding: 9px 12px;
  border-radius: 12px;
  transition: background 0.16s ease, color 0.16s ease;
}
nav a:hover { background: rgba(255, 255, 255, 0.7); color: var(--ink); }
nav a.on {
  color: #fff;
  background: linear-gradient(180deg, var(--ramp-4), var(--ramp-3));
  box-shadow: 0 3px 10px -2px rgba(37, 106, 191, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
nav a.on .icon { stroke-width: 1.9; }

.out { margin-top: 9px; padding-top: 0; position: relative; }
.out::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--rule);
}
.tag {
  margin-left: auto;
  font-size: 8.5px;
  letter-spacing: 0.1em;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--track);
  color: var(--ramp-2);
}
.out.on .tag { background: rgba(255, 255, 255, 0.25); color: #fff; }

.field {
  margin-top: auto;
  padding: 14px;
  border-radius: 14px;
  background: var(--paper);
  border: 1px solid var(--rule);
}
.period { font-size: 11.5px; color: var(--ink-soft); margin-top: 3px; }

.bar {
  height: 4px;
  border-radius: 999px;
  background: var(--track);
  margin: 11px 0;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ramp-5), var(--ramp-3));
}

.tally { margin: 0; font-size: 10.5px; }
.tally div { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
.tally dt { color: var(--ink-faint); }
.tally dd { margin: 0; font-weight: 500; color: var(--ink); }
.tally dd.zero { color: var(--ramp-3); }

/* Capped and centred in whatever is left of the window. Left-aligned, a wide
   screen pushes all the slack to one side and the page looks off its axis. */
main {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 1180px;
  margin-inline: auto;
  padding: 40px 34px 120px;
}

@media (max-width: 900px) {
  .shell { display: block; }

  /* The panel unrolls into a bar rather than turning into a drawer: four
     destinations do not need a menu to hide behind. */
  aside {
    flex-direction: row;
    align-items: center;
    gap: 18px;
    height: auto;
    margin: 12px;
    padding: 12px 14px;
    border-radius: 20px;
    top: 12px;
    z-index: 10;
  }
  nav { flex-direction: row; margin-left: auto; overflow-x: auto; }
  nav a span { display: none; }
  nav a { padding: 9px 11px; }
  .field { display: none; }
  main { padding: 20px 18px 72px; max-width: none; }
}
</style>
