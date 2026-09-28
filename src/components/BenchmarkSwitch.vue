<script setup lang="ts">
import { LayoutGrid, ListFilter } from '@lucide/vue'

defineProps<{ modelValue: 'pelican' | 'candy' }>()
defineEmits<{ 'update:modelValue': [value: 'pelican' | 'candy'] }>()
</script>

<template>
  <div class="benchmark-switch" role="group" aria-label="作品分类">
    <button type="button" :class="{ active: modelValue === 'pelican' }"
      :aria-pressed="modelValue === 'pelican'" @click="$emit('update:modelValue', 'pelican')">
      <LayoutGrid :size="14" /> 鹈鹕作品
    </button>
    <button type="button" :class="{ active: modelValue === 'candy' }"
      :aria-pressed="modelValue === 'candy'" @click="$emit('update:modelValue', 'candy')">
      <ListFilter :size="14" /> 糖果测试
    </button>
  </div>
</template>

<style scoped>
.benchmark-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--mint-pale);
  max-width: 100%;
  flex-wrap: wrap;
}
.benchmark-switch button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 12px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  background: transparent;
  font-size: .85rem;
  font-weight: 600;
  cursor: pointer;
}
.benchmark-switch button:hover { color: var(--ink); }
.benchmark-switch button.active {
  color: var(--ink);
  background: var(--white);
  box-shadow: 0 1px 3px rgba(15, 23, 42, .08);
}
@media (pointer: coarse) {
  .benchmark-switch button { min-height: 44px; }
}
</style>
