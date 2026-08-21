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
/* The bar floats rather than spanning the window, so the field shows down both
   sides of it and the glass has an edge you can see. */
header {
  position: sticky;
  top: 14px;
  z-index: 10;
  padding: 0 28px;
}

.bar {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 22px;
  display: flex;
  align-items: center;
  gap: 36px;
  background: var(--panel);
  -webkit-backdrop-filter: var(--glass);
  backdrop-filter: var(--glass);
  border: 1px solid var(--panel-edge);
  border-radius: 999px;
  box-shadow: var(--lift-high);
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
  padding: 6px 14px;
  border-radius: 999px;
  transition: background 0.16s ease, color 0.16s ease;
}
nav a:hover { color: var(--ink); background: rgba(255, 255, 255, 0.6); }
nav a.on {
  color: #fff;
  background: linear-gradient(180deg, var(--ramp-4), var(--ramp-3));
  box-shadow: 0 2px 8px -1px rgba(37, 106, 191, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.period {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.02em;
}

main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 28px 120px;
}

@media (max-width: 760px) {
  header { padding: 0 12px; top: 8px; }
  .bar { flex-wrap: wrap; gap: 12px; padding: 12px 18px; border-radius: 22px; }
  nav { margin-left: 0; order: 3; width: 100%; overflow-x: auto; }
  .period { margin-left: auto; }
  main { padding: 28px 18px 72px; }
}
</style>
