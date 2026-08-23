<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';

// Sub-navigation within a section: the headline view, and the page that shows
// how that view was arrived at. Three sections use the same pattern, so the
// markup lives here once and each caller supplies its own labels.
defineProps<{ tabs: { to: string; label: string }[] }>();

const route = useRoute();
</script>

<template>
  <nav class="subtabs">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="sans"
      :class="{ on: route.path === tab.to }"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.subtabs { display: flex; gap: 4px; flex-wrap: wrap; }

.subtabs a {
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-faint);
  padding: 7px 15px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: background 0.16s ease, color 0.16s ease;
}
.subtabs a:hover { color: var(--ink); background: rgba(255, 255, 255, 0.7); }
.subtabs a.on {
  color: var(--ramp-1);
  background: var(--panel);
  border-color: var(--panel-edge);
  box-shadow: var(--lift);
}
</style>
