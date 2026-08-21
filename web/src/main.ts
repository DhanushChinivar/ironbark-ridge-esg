import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Overview from './views/Overview.vue';
import Emissions from './views/Emissions.vue';
import Safety from './views/Safety.vue';
import DataTrust from './views/DataTrust.vue';
import './theme.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Overview, name: 'Overview' },
    { path: '/emissions', component: Emissions, name: 'Emissions' },
    { path: '/safety', component: Safety, name: 'Safety' },
    { path: '/data-trust', component: DataTrust, name: 'Data Trust' },
  ],
});

createApp(App).use(router).mount('#app');
