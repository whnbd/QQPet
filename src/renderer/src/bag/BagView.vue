<template>
  <div class="bag-view">
    <!-- 物品网格（嵌入中心窗口，顶部元宝已由中心窗口顶栏展示） -->
    <div v-if="list.length" class="grid">
      <div v-for="it in list" :key="it.file" class="cell">
        <img v-if="it.src" class="icon" :src="it.src" alt="" draggable="false" />
        <div class="name">{{ it.name }}</div>
        <div class="count">×{{ it.count }}</div>
        <div class="eff">{{ effectText(it) }}</div>
      </div>
    </div>
    <div v-else class="empty">背包空空的，去商店买点吧～</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const list = ref([])

const effectText = (it) =>
  it.effect === 'eat' ? `饱食 +${it.value}`
    : it.effect === 'clean' ? `清洁 +${it.value}`
    : `健康 +${it.value}`

// 图标：吃食 → assets/img_res/food/，清洁/药品 → assets/img_res/medicine/
async function load() {
  try {
    const inv = JSON.parse(localStorage.getItem('qqpet.inventory') || '{}')
    const entries = Object.entries(inv).filter(([, it]) => it && it.count > 0)
    list.value = await Promise.all(
      entries.map(async ([file, it]) => {
        const folder = it.effect === 'eat' ? 'food' : 'medicine'
        let src = ''
        try {
          src = await window.api.readImage(`assets/img_res/${folder}/${file}`)
        } catch (_) {
          src = ''
        }
        return { file, count: it.count, name: it.name, effect: it.effect, value: it.value, src }
      })
    )
  } catch (_) {
    list.value = []
  }
}

// 背包实时刷新：通过主进程广播信号（storage-changed）替代轮询
let offStorage = null
let lastInv = ''
async function refreshSync() {
  const raw = localStorage.getItem('qqpet.inventory') || '{}'
  if (raw !== lastInv) {
    lastInv = raw
    await load()
  }
}

onMounted(async () => {
  lastInv = ''
  await refreshSync()
  offStorage = window.api.onStorageChanged?.(refreshSync)
})
onUnmounted(() => {
  if (offStorage) offStorage()
})
</script>

<style scoped>
.bag-view {
  width: 100%;
  height: 100%;
  padding: 6px;
  box-sizing: border-box;
  overflow-y: auto;
}

.bag-view::-webkit-scrollbar {
  width: 8px;
}
.bag-view::-webkit-scrollbar-track {
  background: rgba(139, 105, 20, 0.2);
  border-radius: 4px;
}
.bag-view::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ffd700, #ffa500);
  border-radius: 4px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  background: #fff8dc;
  border: 1px solid #8b6914;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(139, 105, 20, 0.2);
}
.cell .icon {
  width: 46px;
  height: 46px;
  object-fit: contain;
}
.cell .name {
  margin-top: 3px;
  font-size: 12px;
  color: #5a3a00;
  text-align: center;
}
.cell .count {
  margin-top: 1px;
  font-size: 12px;
  font-weight: bold;
  color: #c07a10;
}
.cell .eff {
  margin-top: 1px;
  font-size: 11px;
  color: #7a5a30;
}

.empty {
  margin-top: 60px;
  text-align: center;
  font-size: 13px;
  color: #a08050;
}
</style>
