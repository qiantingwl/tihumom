<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; copy?: string }>()
</script>

<template>
  <header class="section-heading">
    <div><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span><h2>{{ title }}</h2></div>
    <p v-if="copy">{{ copy }}</p>
    <slot />
  </header>
</template>
