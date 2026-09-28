<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Bird, Menu, X } from '@lucide/vue'
import { useRoute } from 'vue-router'
import TestDrawer from './components/TestDrawer.vue'
import { fetchBootstrapData } from './services/api'

const menuOpen = ref(false)
const drawerOpen = ref(false)
const route = useRoute()
const brandName = ref('鹈鹕妈妈')
const brandSub = ref('PELICAN OBSERVATORY')
// Match the deployed default from the first render, before bootstrap resolves.
const brandLogoUrl = ref('/logo.png')

onMounted(async () => {
  try {
    const data = await fetchBootstrapData()
    if (data?.settings) {
      if (data.settings.brandName) brandName.value = data.settings.brandName
      if (data.settings.brandSub) brandSub.value = data.settings.brandSub
      if (typeof data.settings.brandLogoUrl === 'string') brandLogoUrl.value = data.settings.brandLogoUrl
    }
  } catch {}
})
const links = [
  ['/', '首页'],
  ['/test', '现场检测'],
  ['/gallery', '作品墙'],
  ['/compare', '同题对比'],
  ['/stats', '检测统计'],
  ['/suspicious', '可疑样本'],
  ['/api-docs', 'API 接入'],
]
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink class="brand" to="/" :aria-label="brandName + '首页'" @click="menuOpen = false">
          <span class="brand-mark">
            <img v-if="brandLogoUrl" :src="brandLogoUrl" :alt="brandName" class="custom-brand-logo" width="32" height="32" fetchpriority="high" />
            <Bird v-else :size="24" stroke-width="1.8" />
          </span>
          <span><b>{{ brandName }}</b><small>{{ brandSub }}</small></span>
        </RouterLink>
        <nav :class="['main-nav', { open: menuOpen }]" aria-label="主导航">
          <RouterLink
            v-for="link in links"
            :key="link[0]"
            :to="link[0]"
            :class="{ active: route.path === link[0] }"
            @click="menuOpen = false"
          >
            {{ link[1] }}
          </RouterLink>
        </nav>
        <button class="header-cta-btn" type="button" @click="drawerOpen = true">
          测一下 GPT-6
        </button>
        <button class="menu-button" type="button" :aria-expanded="menuOpen" aria-label="切换导航" @click="menuOpen = !menuOpen">
          <X v-if="menuOpen" :size="22" />
          <Menu v-else :size="22" />
        </button>
      </div>
    </header>

    <main><RouterView /></main>

    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <img v-if="brandLogoUrl" :src="brandLogoUrl" :alt="brandName" class="custom-brand-logo-sm" />
          <Bird v-else :size="22" />
          <b>{{ brandName }} · 观察站</b>
          <span>一次结果不是结论，多跑几圈再判断。标准 vs 失败，看图就懂。</span>
        </div>
        <div class="footer-links">
          <RouterLink to="/stats">统计</RouterLink>
          <RouterLink to="/suspicious">可疑样本</RouterLink>
          <RouterLink to="/api-docs">API</RouterLink>
        </div>
      </div>
    </footer>

    <!-- 测一下 GPT-6 侧边栏 -->
    <TestDrawer :open="drawerOpen" @close="drawerOpen = false" />
  </div>
</template>

<style scoped>
.header-cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 108px;
  height: 38px;
  padding: 0 16px;
  border-radius: 6px;
  background: #0f172a;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.header-cta-btn:hover {
  opacity: 0.9;
}
.custom-brand-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  display: block;
}
.custom-brand-logo-sm {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: inline-block;
}
</style>
