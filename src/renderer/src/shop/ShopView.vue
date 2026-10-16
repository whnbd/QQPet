<template>
  <div class="shop" >
    <!-- 提示 -->
    <div v-if="tip" class="tip">{{ tip }}</div>

    <!-- 主体：左列(商品图+介绍) | 右列(分类菜单+商品内容) -->
    <div class="body">
      <!-- 左列：上=商品图片，下=商品介绍 -->
      <div class="left">
        <!-- 左上：选中商品的图片 -->
        <div class="preview">
          <img v-if="selected && selected.src" :src="selected.src" alt="" draggable="false" />
        </div>

        <!-- 左下：商品介绍 -->
        <div class="detail-info">
          <div class="info-name" v-if="selected">{{ selected.name }}</div>
          <div class="info-effect" v-if="selected">{{ effectText(selected.effect, selected.value) }}</div>
          <div class="info-desc" v-if="selected">
            {{ selected.category === '吃食' ? '好吃的食物能让宝贝不再饥饿～' :
               selected.category === '日用品' ? '洗得干干净净，宝贝最舒服～' :
               '及时用药，宝贝才能健健康康～' }}
          </div>
          <div class="info-price" v-if="selected">{{ selected.price }} 金币</div>
          <button class="buy-btn" :disabled="!selected || coins < selected.price" @click="buy(selected)">
            {{ !selected ? '' : coins < selected.price ? '金币不足' : '购买' }}
          </button>
        </div>
      </div>

      <!-- 右列：上=分类菜单，下=商品内容，底=金币栏 -->
      <div class="right">
        <!-- 右上：商品分类菜单 -->
        <div class="cats">
          <div
            v-for="c in cats"
            :key="c.key"
            class="cat"
            :class="{ active: activeCat === c.key }"
            @click="activeCat = c.key"
          >{{ c.label }}</div>
        </div>

        <!-- 右下：商品内容网格 -->
        <div class="grid">
          <div
            v-for="item in filteredItems"
            :key="item.file"
            class="cell"
            :class="{ active: selected && selected.file === item.file }"
            @click="selected = item"
          >
            <img v-if="item.src" class="icon" :src="item.src" alt="" draggable="false" />
            <div class="name">{{ item.name }}</div>
            <div class="price">{{ item.price }}金币</div>
          </div>
        </div>

        <!-- 背包栏：显示已购物品及数量（喂食/清洁/治疗需消耗背包物品） -->
        <div class="bag">
          <div class="bag-title">背包</div>
          <div class="bag-items">
            <div v-for="it in bagList" :key="it.file" class="bag-item" :title="`${it.name} × ${it.count}`">
              <img v-if="it.src" :src="it.src" alt="" draggable="false" />
              <span class="bag-count">×{{ it.count }}</span>
            </div>
            <div v-if="!bagList.length" class="bag-empty">背包空空的，去商店买点吧～</div>
          </div>
        </div>

        <!-- 底部金币栏 -->
        <div class="coin-bar">
          <span class="coin-label">元宝</span>
          <span class="coin-num">{{ coins }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 分类菜单：effect → 分类
const cats = [
  { key: 'all', label: '全部' },
  { key: 'eat', label: '食物' },
  { key: 'clean', label: '清洁' },
  { key: 'cure', label: '药品' }
]
const activeCat = ref('all')

// 商品目录：isGif=true 用 assets/img_res/food/ 下的真实 QQ 食物 GIF（名称/价格取自原版 shop.js）；
// 其余用 shop/buy/ 的 svg 图标。
// 效果：eat=喂食动画/饱食+value、clean=清洁动画/清洁+value、cure=治疗动画/健康+value
const ITEMS = [
  // —— 食物（QQ 原版，按价格从低到高）——
  { file: '102010001.gif', name: '圈圈冰激凌', price: 5, value: 12, effect: 'eat', isGif: true },
  { file: '102010003.gif', name: '月光饼饼', price: 10, value: 18, effect: 'eat', isGif: true },
  { file: '102010012.gif', name: '桃桃布丁', price: 10, value: 18, effect: 'eat', isGif: true },
  { file: '10013004.gif', name: '可乐', price: 12, value: 20, effect: 'eat', isGif: true },
  { file: '10013007.gif', name: '棒棒糖', price: 12, value: 20, effect: 'eat', isGif: true },
  { file: '10013006.gif', name: '冰淇淋', price: 12, value: 20, effect: 'eat', isGif: true },
  { file: '10013008.gif', name: '巧克力', price: 15, value: 24, effect: 'eat', isGif: true },
  { file: '102010010.gif', name: '伟大可乐', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '102010014.gif', name: '西湖龙井', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '102010016.gif', name: '滴答果果', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '102010004.gif', name: '果味米米花', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '102010020.gif', name: '冰红茶', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '10013009.gif', name: '牛肉干', price: 18, value: 26, effect: 'eat', isGif: true },
  { file: '10013013.gif', name: '香瓜果冻', price: 20, value: 30, effect: 'eat', isGif: true },
  { file: '102010021.gif', name: '康师傅红茶', price: 40, value: 42, effect: 'eat', isGif: true },
  { file: '102010009.gif', name: '漂漂孔雀果', price: 40, value: 42, effect: 'eat', isGif: true },
  { file: '102010026.gif', name: '五彩沙拉', price: 40, value: 42, effect: 'eat', isGif: true },
  { file: '102010013.gif', name: '怪怪巧克力', price: 50, value: 50, effect: 'eat', isGif: true },
  { file: '102010024.gif', name: '霹雳啪啦糖', price: 50, value: 50, effect: 'eat', isGif: true },
  { file: '102010006.gif', name: '蹦豆豆卷', price: 60, value: 55, effect: 'eat', isGif: true },
  { file: '102010005.gif', name: '炸虾盖饭', price: 100, value: 70, effect: 'eat', isGif: true },
  { file: '102010023.gif', name: '金钢竹筒饭', price: 100, value: 70, effect: 'eat', isGif: true },
  // —— 清洁 / 药品（img_res/medicine 下的真实 QQ 素材 GIF）——
  { file: '10001.gif', folder: 'medicine', name: '小梳子', price: 18, value: 24, effect: 'clean', isGif: true },
  { file: '20001.gif', folder: 'medicine', name: '香皂', price: 15, value: 20, effect: 'clean', isGif: true },
  { file: '30001.gif', folder: 'medicine', name: '沐浴露', price: 28, value: 38, effect: 'clean', isGif: true },
  { file: '40001.gif', folder: 'medicine', name: '创可贴', price: 35, value: 40, effect: 'cure', isGif: true },
  { file: '50001.gif', folder: 'medicine', name: '感冒药', price: 40, value: 50, effect: 'cure', isGif: true },
  { file: '60001.gif', folder: 'medicine', name: '康复营养液', price: 60, value: 60, effect: 'cure', isGif: true }
]

const effectText = (effect, value) =>
  effect === 'eat' ? `饱食度 +${value}`
    : effect === 'clean' ? `清洁度 +${value}`
    : `健康度 +${value}`

const bg = ref('')
const items = ref([])
// 当前选中的商品（右侧展示其大图与介绍）
const selected = ref(null)
// 按当前分类过滤显示的商品
const filteredItems = computed(() =>
  activeCat.value === 'all' ? items.value : items.value.filter((it) => it.effect === activeCat.value)
)
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
// 背包：localStorage 键 qqpet.inventory，结构 { [file]: { count, effect, value, name } }
const bagList = ref([])
// 实时刷新元宝/背包：通过主进程广播信号（storage-changed）替代轮询
let offStorage = null
function refreshSync() {
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
  try {
    const inv = JSON.parse(localStorage.getItem('qqpet.inventory') || '{}')
    bagList.value = Object.entries(inv)
      .filter(([, it]) => it && it.count > 0)
      .map(([file, it]) => {
        const src = items.value.find((x) => x.file === file)?.src || ''
        return { file, count: it.count, name: it.name, src }
      })
  } catch (_) {
    bagList.value = []
  }
}
const tip = ref('')
let tipTimer = null

function showTip(text) {
  tip.value = text
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => { tip.value = '' }, 2200)
}

async function load() {
  try {
    bg.value = await window.api.readImage('assets/shop/store/Store_img/BG.png')
  } catch (_) {
    bg.value = ''
  }
  // 加载商品图标：按 item.folder（food/medicine）从 img_res 读 GIF；旧 svg 兜底走 readSvg
  const loaded = await Promise.all(
    ITEMS.map(async (it) => {
      try {
        return it.isGif
          ? await window.api.readImage(`assets/img_res/${it.folder || 'food'}/${it.file}`)
          : await window.api.readSvg('assets/shop/buy/' + it.file)
      } catch (_) {
        return ''
      }
    })
  )
  items.value = ITEMS.map((it, i) => ({
    ...it,
    src: loaded[i],
    category: it.effect === 'eat' ? '吃食' : it.effect === 'clean' ? '日用品' : '药品'
  }))
  // 默认选中第一个商品
  if (!selected.value) selected.value = items.value.find((i) => i) || null
}

function buy(item) {
  if (coins.value < item.price) {
    showTip('金币不足，先去打工赚金币吧！')
    return
  }
  coins.value -= item.price
  localStorage.setItem('qqpet.coins', String(coins.value))
  // 购买 → 放入背包（不再立即使用；喂食/清洁/治疗在宠物窗口消耗背包物品）
  const inv = JSON.parse(localStorage.getItem('qqpet.inventory') || '{}')
  if (inv[item.file]) inv[item.file].count++
  else inv[item.file] = { count: 1, effect: item.effect, value: item.value, name: item.name }
  localStorage.setItem('qqpet.inventory', JSON.stringify(inv))
  refreshSync()
  window.api.storageChanged?.() // 广播：背包/小游戏窗口即时刷新
  window.api.sendPetBubble(`买到了${item.name}，已放入背包！`)
  showTip(`购买成功：${item.name}（${effectText(item.effect, item.value)}）已放入背包`)
}

onMounted(async () => {
  await load()
  refreshSync()
  offStorage = window.api.onStorageChanged?.(refreshSync)
})
onUnmounted(() => {
  if (offStorage) offStorage()
})
</script>

<style scoped>
.shop {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #ffe7bb;
  color: #5a3a00;
}

/* 顶部栏已移至中心窗口（CenterView），本页不再绘制标题/关闭 */

.tip {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 249, 232, 0.95);
  border: 1px solid #e0a63a;
  border-radius: 10px;
  padding: 4px 16px;
  font-size: 13px;
  z-index: 10;
  pointer-events: none;
}

/* 主体：左(预览+分类+列表+金币栏) | 右(大图+介绍+购买) 分栏 */
.body {
  position: absolute;
  top: 4px;
  left: 14px;
  right: 14px;
  bottom: 14px;
  display: flex;
  gap: 12px;
}

/* 左列：上=商品图片，下=商品介绍 */
.left {
  width: 270px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 左上：商品图片区：羊皮纸色渐变 + 浮雕边框 */
.preview {
  flex: 3;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #fff8dc 0%, #f5e6d3 70%, #e8d4b8 100%);
  border: 2px solid #8b6914;
  border-radius: 10px;
  box-shadow:
    inset 2px 2px 4px rgba(255, 255, 255, 0.5),
    inset -2px -2px 4px rgba(139, 105, 20, 0.25);
  overflow: hidden;
}
.preview img {
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
}

/* 金黄色分类标题栏 */
.cats {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 3px;
  background: linear-gradient(180deg, #ffd700 0%, #ffa500 50%, #ff8c00 100%);
  border: 2px solid #8b6914;
  border-radius: 8px;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.5);
}
.cat {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  text-align: center;
  color: #5a3a00;
  background: rgba(255, 248, 220, 0.6);
  border: 1px solid transparent;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cat:hover {
  background: rgba(255, 248, 220, 0.95);
}
.cat.active {
  background: linear-gradient(180deg, #fff8dc, #f5e6d3);
  color: #8b4500;
  border-color: #8b6914;
  font-weight: bold;
  box-shadow: 0 1px 2px rgba(139, 105, 20, 0.35);
}

/* 商品列表网格：浅棕色背景 */
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 78px;
  gap: 6px;
  padding: 6px;
  background: #c4a77d;
  border: 2px solid #8b6914;
  border-radius: 8px;
  overflow-y: auto;
  align-content: start;
  box-sizing: border-box;
  box-shadow: inset 0 0 6px rgba(139, 105, 20, 0.3);
}

/* 滚动条美化 */
.grid::-webkit-scrollbar {
  width: 8px;
}
.grid::-webkit-scrollbar-track {
  background: rgba(139, 105, 20, 0.2);
  border-radius: 4px;
}
.grid::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ffd700, #ffa500);
  border-radius: 4px;
}
.grid::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #ffe700, #ffb000);
}

.cell {
  position: relative;
  background: rgba(255, 248, 220, 0.9);
  border: 1px solid #8b6914;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
  box-sizing: border-box;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.cell:hover {
  transform: scale(1.04);
}
.cell.active {
  background: linear-gradient(180deg, #fff8dc, #f5e6d3);
  border-color: #c07a10;
  box-shadow: 0 0 0 2px rgba(192, 122, 16, 0.4), inset 0 0 4px rgba(255, 215, 0, 0.4);
}

.cell .icon {
  width: 38px;
  height: 38px;
  object-fit: contain;
}
.cell .name {
  margin-top: 2px;
  font-size: 11px;
  color: #5a3a00;
}
.cell .price {
  margin-top: 1px;
  font-size: 11px;
  color: #c07a10;
  font-weight: bold;
}

/* 背包栏：横向展示已购物品 */
.bag {
  flex: none;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: rgba(255, 248, 220, 0.85);
  border: 2px solid #8b6914;
  border-radius: 8px;
  box-sizing: border-box;
}
.bag-title {
  flex: none;
  font-size: 13px;
  font-weight: bold;
  color: #8b4500;
}
.bag-items {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
}
.bag-items::-webkit-scrollbar {
  height: 6px;
}
.bag-items::-webkit-scrollbar-track {
  background: rgba(139, 105, 20, 0.15);
  border-radius: 3px;
}
.bag-items::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, #ffd700, #ffa500);
  border-radius: 3px;
}
.bag-item {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 248, 220, 0.9);
  border: 1px solid #8b6914;
  border-radius: 6px;
}
.bag-item img {
  max-width: 32px;
  max-height: 32px;
  object-fit: contain;
}
.bag-count {
  position: absolute;
  right: 2px;
  bottom: 0;
  font-size: 10px;
  font-weight: bold;
  color: #fff;
  background: rgba(192, 122, 16, 0.85);
  border-radius: 4px;
  padding: 0 3px;
}
.bag-empty {
  font-size: 12px;
  color: #a08050;
}

/* 底部金币栏：金黄渐变 + 虚线边框 */
.coin-bar {
  flex: none;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: linear-gradient(180deg, #ffe66f 0%, #ffb90f 100%);
  border: 2px dashed #cc9933;
  border-radius: 8px;
  font-size: 14px;
  color: #5a3a00;
  font-weight: bold;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.5);
}
.coin-label {
  color: #5a3a00;
}
.coin-num {
  color: #8b4500;
  font-size: 16px;
  font-weight: bold;
}

/* 右列：上=分类菜单，下=商品内容，底=金币栏 */
.right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 商品详情（左下：商品介绍） */
.detail-info {
  flex: 2;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 248, 220, 0.7);
  border: 2px solid #8b6914;
  border-radius: 8px;
  box-shadow: inset 0 0 6px rgba(139, 105, 20, 0.15);
}
.info-name {
  font-size: 18px;
  font-weight: bold;
  color: #8b4500;
}
.info-effect {
  font-size: 14px;
  color: #c07a10;
  font-weight: bold;
}
.info-desc {
  font-size: 12px;
  color: #7a5a30;
  line-height: 1.4;
}
.info-price {
  font-size: 16px;
  font-weight: bold;
  color: #c07a10;
}
.buy-btn {
  margin-top: 4px;
  padding: 7px 36px;
  font-size: 15px;
  font-weight: bold;
  color: #5a3a00;
  background: linear-gradient(180deg, #ffd700 0%, #ffa500 50%, #ff8c00 100%);
  border: 2px solid #8b6914;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 2px 3px rgba(139, 105, 20, 0.3);
}
.buy-btn:hover:not(:disabled) {
  transform: scale(1.05);
  background: linear-gradient(180deg, #ffe700 0%, #ffb000 50%, #ff9c00 100%);
}
.buy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
