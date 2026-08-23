import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Overview from './views/Overview.vue';
import Emissions from './views/Emissions.vue';
import Safety from './views/Safety.vue';
import DataTrust from './views/DataTrust.vue';
import Report from './views/Report.vue';
import Calculation from './views/Calculation.vue';
import AiMethod from './views/AiMethod.vue';
import Suppliers from './views/Suppliers.vue';
import './theme.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Overview, name: 'Overview' },
    { path: '/emissions', component: Emissions, name: 'Emissions' },
    { path: '/emissions/calculation', component: Calculation, name: 'Calculation' },
    { path: '/safety', component: Safety, name: 'Safety' },
    { path: '/safety/method', component: AiMethod, name: 'AI method' },
    { path: '/data-trust', component: DataTrust, name: 'Data trust' },
    { path: '/data-trust/suppliers', component: Suppliers, name: 'Supplier matching' },
    { path: '/report', component: Report, name: 'Report' },
  ],
});

createApp(App).use(router).mount('#app');
