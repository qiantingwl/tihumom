import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import TestView from './views/TestView.vue'
import GalleryView from './views/GalleryView.vue'
import CompareView from './views/CompareView.vue'
import StatsView from './views/StatsView.vue'
import SuspiciousView from './views/SuspiciousView.vue'
import ApiView from './views/ApiView.vue'
import AdminView from './views/AdminView.vue'
import './styles.css'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, savedPosition) => {
    // Opening or closing a work only changes the query; keep the list in place.
    if (to.path === from.path) return false
    return savedPosition || { top: 0, left: 0, behavior: 'instant' }
  },
  routes: [
    { path: '/', component: HomeView },
    { path: '/test', component: TestView },
    { path: '/gallery', component: GalleryView },
    { path: '/compare', component: CompareView },
    { path: '/stats', component: StatsView },
    { path: '/suspicious', component: SuspiciousView },
    { path: '/api-docs', component: ApiView },
    { path: '/admin', component: AdminView },
  ],
})

createApp(App).use(router).mount('#app')
