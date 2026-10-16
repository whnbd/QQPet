<template>
  <div class="speech-bubble" :class="{ visible: visible && text }">
    <div class="bubble">{{ text }}</div>
    <div class="tail"></div>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
  visible: { type: Boolean, default: false }
})
</script>

<style scoped>
.speech-bubble {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease;
  z-index: 5;
}
.speech-bubble.visible {
  opacity: 1;
}
.bubble {
  max-width: 88%;
  background: #fff9e8;
  color: #5a3a00;
  border: 2px solid #e0a63a;
  border-radius: 14px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  word-break: break-all;
}
.tail {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid #e0a63a;
  margin-top: -1px;
}
</style>