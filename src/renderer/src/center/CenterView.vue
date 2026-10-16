<template>
  <div class="center-root">
    <!-- 顶部标签栏：商店 / 小游戏 / 宠物信息 + 元宝 + 关闭（拖动整窗） -->
    <div class="center-top">
      <div class="tabs">
        <div
          class="tab"
          :class="{ active: activeTab === 'shop' }"
          @click="activeTab = 'shop'"
        >商店</div>
        <div
          class="tab"
          :class="{ active: activeTab === 'game' }"
          @click="activeTab = 'game'"
        >小游戏</div>
        <div
          class="tab"
          :class="{ active: activeTab === 'info' }"
          @click="activeTab = 'info'"
        >宠物信息</div>
        <div
          class="tab"
          :class="{ active: activeTab === 'bag' }"
          @click="activeTab = 'bag'"
        >背包</div>
      </div>
      <div class="coin-box">
        <span class="coin-label">元宝</span>
        <span class="coin-num">{{ coins }}</span>
      </div>
      <div class="close-btn" @click="close">×</div>
    </div>

    <!-- 内容区：v-show 切换（组件不销毁，小游戏播放/商店选中状态保留） -->
    <div class="center-body">
      <div v-show="activeTab === 'shop'" class="page">
        <ShopView />
      </div>
      <div v-show="activeTab === 'game'" class="page">
        <GameView />
      </div>
      <div v-show="activeTab === 'info'" class="page">
        <InfoView />
      </div>
      <div v-show="activeTab === 'bag'" class="page">
        <BagView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ShopView from '../shop/ShopView.vue'
import GameView from '../game/GameView.vue'
import InfoView from '../info/InfoView.vue'
import BagView from '../bag/BagView.vue'

// 初始标签页由主进程加载 URL 的 ?tab= 决定（open-shop/open-game/open-info）
const activeTab = ref(new URLSearchParams(location.search).get('tab') || 'shop')

// 顶部元宝实时显示：storage-changed 广播（与商店/背包同 partition，直接读 localStorage）
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
let offStorage = null
function refreshCoins() {
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
}

function close() {
  window.api.closeSelf()
}

onMounted(() => {
  refreshCoins()
  offStorage = window.api.onStorageChanged?.(refreshCoins)
})
onUnmounted(() => {
  if (offStorage) offStorage()
})
</script>

<style>
html,
body,
#app {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  display: block !important;
  background: transparent !important;
  -webkit-user-select: none;
  user-select: none;
  font-family: 'Microsoft YaHei', sans-serif;
}

.center-root {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid #0e0d0d;
  border-radius: 5px;
  background: linear-gradient(160deg, #ffe9c4 0%, #ffe7bb 55%, #f3d6a2 100%);
  overflow: hidden;
}

/* 顶部标签栏 */
.center-top {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #ffd700 0%, #ffa500 50%, #ff8c00 100%);
  border-bottom: 2px solid #8b6914;
  box-shadow: 0 2px 8px rgba(139, 105, 20, 0.35);
  -webkit-app-region: drag;
}
.tabs {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.tab {
  padding: 5px 14px;
  font-size: 13px;
  color: #5a3a00;
  background: rgba(255, 248, 220, 0.6);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.tab:hover {
  background: rgba(255, 248, 220, 0.95);
}
.tab.active {
  background: linear-gradient(180deg, #fff8dc, #f5e6d3);
  color: #8b4500;
  border-color: #8b6914;
  font-weight: bold;
  box-shadow: 0 1px 2px rgba(139, 105, 20, 0.35);
}
.coin-box {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  margin-right: 8px;
  padding: 3px 12px;
  background: rgba(255, 248, 220, 0.92);
  border: 2px dashed #cc9933;
  border-radius: 12px;
  -webkit-app-region: no-drag;
}
.coin-label {
  font-size: 12px;
  color: #5a3a00;
}
.coin-num {
  font-size: 15px;
  font-weight: bold;
  color: #8b4500;
}
.close-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(200, 60, 60, 0.85);
  color: #fff;
  font-size: 15px;
  line-height: 24px;
  text-align: center;
  cursor: pointer;
  border: 1px solid rgba(139, 105, 20, 0.4);
  -webkit-app-region: no-drag;
}
.close-btn:hover {
  background: #e04848;
}

/* 内容区：铺满顶栏以下 */
.center-body {
  position: absolute;
  left: 0;
  top: 42px;
  right: 0;
  bottom: 0;
  padding: 8px;
  box-sizing: border-box;
}
.page {
  width: 100%;
  height: 100%;
}
</style>
