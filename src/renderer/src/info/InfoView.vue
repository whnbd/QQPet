<template>
  <div class="info-root">
    <!-- 标题：16.svg 光芒做装饰 -->
    <div class="info-title">
      <img v-if="glow" class="title-glow" :src="glow" alt="" draggable="false" />
      <span class="title-text">宠物信息</span>
    </div>

    <!-- 档案卡：纯 CSS 暖金渐变卡片 + 圆角双边框，内部按百分比区域叠加 -->
    <div class="card">
      <!-- 照片框：当前阶段图（蛋/幼年/成年，按性别 GG/MM） -->
      <div class="photo">
        <img v-if="stageSrc" :src="stageSrc" alt="" draggable="false" />
      </div>
      <!-- 右上：宠物昵称 -->
      <div class="label upper">
        <span class="label-k">昵称</span><span class="label-v">{{ petName || '未命名' }}</span>
      </div>
      <!-- 右侧第二行：主人 -->
      <!-- <div class="label lower">
        <span class="label-k">主人</span><span class="label-v">{{ owner }}</span>
      </div> -->
      <!-- 右侧第三行：等级 -->
      <div class="label lower"><span class="label-k">等级</span><span class="label-v">Lv.{{ level }}</span></div>
      <!-- 右侧第四行：阶段 -->
      <div class="tag tag1"><span class="label-k">阶段</span><span class="label-v">{{ stageName }}</span></div>
      <!-- 贴心宝贝徽章 -->
      <img v-if="badge" class="badge" :src="badge" alt="" draggable="false" />
    </div>

    <!-- 经验条：纯 HTML/CSS 圆角轨道 + 金色渐变填充 -->
    <div class="exp-row">
      <div class="exp-track">
        <div class="exp-fill" :style="{ width: expPct + '%' }"></div>
      </div>
      <span class="exp-text">{{ expNeed ? `经验 ${exp} / ${expNeed}` : '经验 MAX' }}</span>
    </div>

    <!-- 属性条：饱食 / 清洁 / 健康 / 心情 -->
    <div class="stats">
      <div v-for="s in stats" :key="s.key" class="stat">
        <div class="stat-head">
          <span>{{ s.label }}</span>
          <span class="stat-val">{{ s.cur }}/{{ s.max }}</span>
        </div>
        <div class="stat-bar">
          <div class="stat-fill" :style="{ width: s.pct + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

// 升级所需经验表（与 usePetMachine.LEVEL_EXP 一致）
const LEVEL_EXP = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]

// —— 从 localStorage 读取宠物数据（与宠物窗口共享 partition，1s 轮询 + 广播即时刷新）——
const gender = ref(localStorage.getItem('qqpet.gender') || 'GG')
const petName = ref(localStorage.getItem('qqpet.name') || '')
const owner = ref(localStorage.getItem('qqpet.savedQq') || '主人')
const level = ref(Number(localStorage.getItem('qqpet.level')) || 1)
const exp = ref(Number(localStorage.getItem('qqpet.exp')) || 0)
const hunger = ref(100)
const clean = ref(100)
const health = ref(100)
const moodVal = ref(1000)

// 素材（dataURL）
const glow = ref('')
const badge = ref('')
const stageSrc = ref('')

// 阶段：1-4 蛋期 / 5-9 幼年期 / 10+ 成年期；图片按性别前缀 GG/MM
const stageBand = computed(() => (level.value >= 10 ? 3 : level.value >= 5 ? 2 : 1))
const stageName = computed(() => (level.value >= 10 ? '成年期' : level.value >= 5 ? '幼年期' : '蛋期'))
const stageKey = computed(() => `${gender.value}${stageBand.value}`)

const expNeed = computed(() => LEVEL_EXP[level.value - 1])
const expPct = computed(() => {
  const need = expNeed.value
  return need ? Math.min(100, Math.round((exp.value / need) * 100)) : 100
})

const stats = computed(() => [
  { key: 'hunger', label: '饱食', cur: hunger.value, max: 100, pct: hunger.value },
  { key: 'clean', label: '清洁', cur: clean.value, max: 100, pct: clean.value },
  { key: 'health', label: '健康', cur: health.value, max: 100, pct: health.value },
  { key: 'mood', label: '心情', cur: moodVal.value, max: 1000, pct: Math.round(moodVal.value / 10) }
])

async function loadImages() {
  try { glow.value = await window.api.readSvg('assets/info/16.svg') } catch (_) { glow.value = '' }
  try { badge.value = await window.api.readSvg('assets/info/64.svg') } catch (_) { badge.value = '' }
}
async function loadStage() {
  try { stageSrc.value = await window.api.readSvg(`assets/info/${stageKey.value}.svg`) } catch (_) { stageSrc.value = '' }
}
// 性别或阶段变化时重载阶段图（只在键真正变化时触发）
watch(stageKey, loadStage)

// 读取 localStorage 全量数据
function refreshData() {
  gender.value = localStorage.getItem('qqpet.gender') || 'GG'
  petName.value = localStorage.getItem('qqpet.name') || ''
  owner.value = localStorage.getItem('qqpet.savedQq') || '主人'
  level.value = Number(localStorage.getItem('qqpet.level')) || 1
  exp.value = Number(localStorage.getItem('qqpet.exp')) || 0
  const readStat = (key, def) => {
    const raw = localStorage.getItem(key)
    return raw === null ? def : (Number(raw) || 0)
  }
  hunger.value = readStat('qqpet.hunger', 100)
  clean.value = readStat('qqpet.clean', 100)
  health.value = readStat('qqpet.health', 100)
  moodVal.value = readStat('qqpet.moodval', 1000)
}

let timer = null
let offStorage = null

onMounted(async () => {
  refreshData()
  await Promise.all([loadImages(), loadStage()])
  offStorage = window.api.onStorageChanged?.(refreshData)
  // 属性值随宠物状态机每秒持久化，此处 1s 轮询保持实时（不依赖只针对元宝/背包的广播）
  timer = setInterval(refreshData, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.info-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  padding-top: 2px;
  overflow: hidden;
}

/* 标题 */
.info-title {
  position: relative;
  width: 240px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.title-glow {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.title-text {
  position: relative;
  z-index: 1;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 3px;
  color: #8b4500;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* 档案卡：纯 CSS 暖金渐变 + 圆角双边框 + 顶部高光（替代原 2.png 背景图） */
.card {
  position: relative;
  width: 560px;
  height: 358px;
  margin-top:4px;
  background: linear-gradient(150deg, #fff8e3 0%, #fbe6b0 55%, #f3cd82 100%);
  border: 2px solid #8b6914;
  border-radius: 16px;
  box-sizing: border-box;
  box-shadow:
    inset 0 0 0 3px rgba(255, 255, 255, 0.5),
    inset 0 1px 8px rgba(255, 255, 255, 0.35),
    0 2px 10px rgba(139, 105, 20, 0.28);
}
/* 顶部内侧高光装饰条 */
.card::before {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  top: 2px;
  height: 24px;
  border-radius: 13px 13px 4px 4px;
  background: linear-gradient(180deg, rgba(139, 105, 20, 0.18), rgba(255, 255, 255, 0));
  pointer-events: none;
}

/* 照片框：左 6%-42%、上 8%-60%，白底圆角相框 */
.photo {
  position: absolute;
  left: 6%;
  top: 8%;
  width: 36%;
  height: 52%;
  background: #fff;
  border: 2px solid #c89a4e;
  border-radius: 10px;
  box-shadow: inset 0 0 6px rgba(139, 105, 20, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.photo img {
  max-width: 86%;
  max-height: 86%;
  object-fit: contain;
}

/* 右侧信息行（昵称/主人/等级/阶段）：左 47%、宽 48%，自上而下排列 */
.label,
.tag {
  position: absolute;
  
  left: 47%;
  width: 48%;
  height: 12%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  color: #5a3a00;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  box-sizing: border-box;
}
.label.upper { top: calc(16% - 30px); }
.label.lower { top: calc(29% - 30px); }
.tag1 { top: calc(42% - 30px); }
.tag2 { top: calc(55% - 30px); }
.label-k { font-size: 13px; opacity: 0.85; }
.label-v { font-size: 16px; font-weight: bold; color: #3a2500; }

/* 贴心宝贝徽章：卡片右上角装饰 */
.badge {
  position: absolute;
  right: 3%;
  top: 2%;
  width: 58px;
  height: 20px;
  object-fit: contain;
}

/* 经验条：纯 HTML/CSS 轨道（圆角 + 内阴影）+ 金色渐变填充 */
.exp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 5px;
}
.exp-track {
  position: relative;
  width: 420px;
  height: 22px;
  background: rgba(139, 105, 20, 0.18);
  border: 2px solid #8b6914;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.18);
}
.exp-fill {
  position: absolute;
  left: 2px;
  top: 2px;
  bottom: 2px;
  background: linear-gradient(90deg, #ffd700, #ffa500);
  border-radius: 10px;
  transition: width 0.3s ease;
}
.exp-text {
  font-size: 12px;
  font-weight: bold;
  color: #5a3a00;
}

/* 属性条 */
.stats {
  display: flex;
  gap: 12px;
  margin-top: 7px;
}
.stat {
  width: 150px;
}
.stat-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #5a3a00;
  margin-bottom: 2px;
}
.stat-val {
  color: #8b4500;
  font-weight: bold;
}
.stat-bar {
  height: 10px;
  background: rgba(139, 105, 20, 0.18);
  border: 1px solid #8b6914;
  border-radius: 6px;
  overflow: hidden;
}
.stat-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffe66f, #ffb90f);
  border-radius: 6px;
  transition: width 0.3s ease;
}
</style>
