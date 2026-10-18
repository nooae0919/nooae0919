<template>
  <div class="action-menu" ref="rootEl">
    <button class="action-menu-btn" @click="toggle">
      操作 <span class="arrow" :class="{ open: isOpen }">▾</span>
    </button>
    <div v-if="isOpen" class="action-menu-panel">
      <a v-for="(item, i) in items" :key="i"
         class="action-menu-item"
         :class="{ disabled: item.disabled }"
         href="#"
         @click.prevent="onClick(item)">
        {{ item.label }}
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] }
});

const isOpen = ref(false);
const rootEl = ref(null);

function toggle() {
  isOpen.value = !isOpen.value;
}

function onClick(item) {
  if (item.disabled) return;
  isOpen.value = false;
  if (typeof item.onClick === 'function') item.onClick();
}

function handleClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.action-menu {
  position: relative;
  display: inline-block;
}
.action-menu-btn {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.action-menu-btn:hover { background: #f3f4f6; }
.arrow {
  display: inline-block;
  margin-left: 6px;
  transition: transform 0.15s;
}
.arrow.open { transform: rotate(180deg); }
.action-menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 160px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 100;
  padding: 4px 0;
}
.action-menu-item {
  display: block;
  padding: 8px 14px;
  color: #222;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.action-menu-item:hover { background: #f3f4f6; }
.action-menu-item.disabled {
  color: #ccc;
  cursor: not-allowed;
}
</style>
