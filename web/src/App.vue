<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
const nav = [
  { to: '/', label: 'Overview' },
  { to: '/emissions', label: 'Emissions' },
  { to: '/safety', label: 'Safety' },
  { to: '/data-trust', label: 'Data Trust' },
];
</script>

<template>
  <header>
    <div class="bar">
      <div class="brand">
        <div class="eyebrow">Ironbark Ridge Resources</div>
        <div class="site sans">ESG &amp; Safety</div>
      </div>
      <nav>
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="sans"
          :class="{ on: route.path === item.to }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="period mono">Jan 2025 – Jun 2026</div>
    </div>
  </header>

  <main>
    <RouterView />
  </main>
</template>

<style scoped>
header {
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 10;
}

.bar {
  max-width: 1120px;
  margin: 0 auto;
  padding: 14px 28px;
  display: flex;
  align-items: center;
  gap: 36px;
}

.site {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

nav {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

nav a {
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-faint);
  padding: 6px 12px;
  border-radius: 3px;
}
nav a:hover { color: var(--ink); }
nav a.on {
  color: var(--ink);
  background: color-mix(in srgb, var(--slate) 12%, transparent);
}

.period {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.02em;
}

main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 28px 96px;
}

@media (max-width: 760px) {
  .bar { flex-wrap: wrap; gap: 12px; padding: 12px 18px; }
  nav { margin-left: 0; order: 3; width: 100%; overflow-x: auto; }
  .period { margin-left: auto; }
  main { padding: 24px 18px 64px; }
}
</style>
