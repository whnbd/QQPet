<template>
  <div class="game-view">
    <!-- 游戏列表页（顶栏已移至中心窗口） -->
    <div v-if="!playing" class="game-list">
      <div class="list-body">
        <div
          v-for="g in games"
          :key="g"
          class="game-item"
          @click="startGame(g)"
        >
          <span class="play-ico">▶</span>
          <span class="game-name-text">{{ g.replace(/\.swf$/i, '') }}</span>
        </div>
      </div>
    </div>

    <!-- 游戏播放页：Flash 游戏需要鼠标交互，不设拦截 overlay -->
    <div v-else class="game-play">
      <div class="play-top">
        <div class="back-btn" @click="goBack">← 返回</div>
        <div class="game-name">{{ playing.replace(/\.swf$/i, '') }}</div>
      </div>
      <div class="flash-wrap">
        <FlashPlayer
          :key="playerKey"
          :src="currentSrc"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import FlashPlayer from '../components/FlashPlayer.vue'

const games = ref([])
const playing = ref('') // 当前正在玩的游戏文件名（空=列表页）
const currentSrc = ref('')
const playerKey = ref(0)

const GAME_MAX = 15 // 每局最多可获元宝
let gameTimer = null
let gameEarned = 0 // 当前局已获得的元宝

// 元宝实时显示：通过主进程广播信号（storage-changed）替代轮询
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
let offStorage = null
function refreshCoins() {
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
}

onMounted(async () => {
  try {
    games.value = await window.api.listFiles('game', 'swf')
  } catch (_) {
    games.value = []
  }
  refreshCoins()
  offStorage = window.api.onStorageChanged?.(refreshCoins)
})
onUnmounted(() => {
  settleReward() // 窗口关闭卸载：先结算本局已获得的元宝播报，再停计时
  stopReward()
  if (offStorage) offStorage()
})

// 元宝与商店/宠物金币共用 localStorage 的 qqpet.coins（多窗口共享 partition）
function addCoins(n) {
  const cur = Number(localStorage.getItem('qqpet.coins')) || 0
  localStorage.setItem('qqpet.coins', String(Math.max(0, cur + n)))
  refreshCoins() // 立即可见
  window.api.storageChanged?.() // 广播：商店/宠物窗口即时刷新
}

// 点击游戏：播放对应 SWF，并开始按游玩时长累计元宝（每 15 秒 +1，最多 15 元宝/局）
function startGame(name) {
  stopReward()
  currentSrc.value = 'assets/game/' + name
  playerKey.value++
  playing.value = name
  gameEarned = 0
  gameTimer = setInterval(() => {
    if (gameEarned < GAME_MAX) {
      gameEarned++
      addCoins(10)
    } else {
      stopReward()
    }
  }, 15000)
}

function stopReward() {
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null }
}

// 局末结算：把本局元宝播报给宠物窗口
function settleReward() {
  if (gameEarned > 0) {
    window.api.sendPetBubble(`小游戏结束，获得 ${gameEarned} 元宝！`)
    gameEarned = 0
  }
}

function goBack() {
  stopReward()
  settleReward()
  playing.value = ''
}
</script>

<style scoped>
.game-view {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* 播放页顶栏（仅返回 + 游戏名，元宝/关闭已移至中心窗口顶部） */
.play-top {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 0 12px;
  background: linear-gradient(180deg, #ffd700 0%, #ffa500 50%, #ff8c00 100%);
  color: #5a3a00;
  border-bottom: 2px solid #8b6914;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(139, 105, 20, 0.35);
}
.game-name {
  font-size: 15px;
  font-weight: bold;
  color: #5a3a00;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}

.back-btn {
  cursor: pointer;
  font-size: 14px;
  padding: 3px 12px;
  border-radius: 10px;
  background: rgba(255, 248, 220, 0.85);
  border: 1px solid #8b6914;
  color: #5a3a00;
}
.back-btn:hover {
  background: #fff8dc;
}

.list-body {
  position: absolute;
  left: 16px;
  top: 12px;
  right: 16px;
  bottom: 12px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  /* 网格本身不撑高，网格超出内容纵向滚动 */
  grid-auto-rows: 78px;
  gap: 14px;
  overflow-y: auto;
  align-content: start;
  padding: 4px 8px 8px 4px;
}

/* 滚动条美化（与商店一致的金色） */
.list-body::-webkit-scrollbar {
  width: 8px;
}
.list-body::-webkit-scrollbar-track {
  background: rgba(139, 105, 20, 0.2);
  border-radius: 4px;
}
.list-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ffd700, #ffa500);
  border-radius: 4px;
}
.list-body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #ffe700, #ffb000);
}

.game-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff8dc;
  border: 2px solid #d4a04a;
  border-radius: 12px;
  padding: 0 14px;
  font-size: 15px;
  color: #5a3a00;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(139, 105, 20, 0.15);
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.game-item:hover {
  transform: translateY(-2px);
  border-color: #8b6914;
  box-shadow: 0 6px 14px rgba(139, 105, 20, 0.25);
}
.game-item:active {
  transform: scale(0.98);
}

.play-ico {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  color: #5a3a00;
  font-size: 13px;
  box-shadow: 0 2px 4px rgba(200, 140, 20, 0.4);
}

.game-name-text {
  font-weight: 600;
}

/* 播放页：顶栏 + 自适应高度 Flash 区 */
.game-play {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.flash-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #000;
  border-radius: 6px;
}
</style>
