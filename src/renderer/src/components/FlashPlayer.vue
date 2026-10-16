<template>
  <div ref="container" class="flash-player-container"></div>
</template>


<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['loaded'])

const props = defineProps({
  src: { type: String, required: true }
})

const container = ref(null)
let player = null
let objectUrl = null

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.RufflePlayer) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 ' + src))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  if (!window.RufflePlayer) {
    await loadScript('/ruffle/ruffle.js')
  }

  const ruffle = window.RufflePlayer.newest()
  if (!ruffle) return // Ruffle 尚未就绪（WASM 初始化中）：放弃本次挂载，避免 null 崩溃
  player = ruffle.createPlayer()
  player.style.width = '100%'
  player.style.height = '100%'
  player.style.background = 'transparent'
  container.value.appendChild(player)

  // 每次切换动画都会重建播放器：从新建 Ruffle 播放器到首帧渲染之间有一段空白期
  // （异步读 SWF + Ruffle 解析），期间窗口内容为空会"闪一下"。加载完成前隐藏容器即可消除。
  // 注意：Ruffle 0.7.1 不派发 'load' 事件，加载完成时只派发 'loadedmetadata'/'loadeddata'，
  // 必须监听这两个事件来恢复显示，否则宠物会一直不可见。
  container.value.style.opacity = '0'
  let revealed = false
  const reveal = () => {
    if (revealed || !container.value) return
    revealed = true
    container.value.style.opacity = '1'
  }
  player.addEventListener('loadeddata', reveal)
  player.addEventListener('loadedmetadata', reveal)

  // 读取 SWF：主进程已从文件头解析出真实总时长（毫秒），直接上报，无需依赖 Ruffle 事件。
  // durationMs 为 null 表示解析失败，仍上报由状态机回退兜底时长。
  const { blobUrl, durationMs } = await window.api.readSwf(props.src)
  // 异步读取期间组件可能已被卸载/重建（动画切换 playerKey++、HMR 等）：
  // 此时 player 已被 onBeforeUnmount 置 null，继续 load() 会抛 TypeError，直接放弃本次加载
  if (disposed || !player) {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    return
  }
  objectUrl = blobUrl
  emit('loaded', durationMs)
  player.load({
    url: blobUrl,
    wmode: 'transparent',
    backgroundColor: null,
    splashScreen: false // 0.7.x 起 preloader 改名 splashScreen，禁用加载屏
  })
})

let disposed = false // 组件卸载标志：异步读取期间避免操作已销毁的播放器
onBeforeUnmount(() => {
  disposed = true
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  if (player) {
    // Ruffle 0.7.1 的 ruffle-player 元素 destroy() 可能不可用：存在才调用，异常忽略，
    // 必须继续执行 remove() 否则元素残留导致 Canvas/实例混乱
    try {
      if (typeof player.destroy === 'function') player.destroy()
    } catch (_) {
      /* 忽略 destroy 异常 */
    }
    player.remove()
    player = null
  }
})
</script>


<style scoped>
.flash-player-container {
  width: 100%;
  height: 100%;
  
}

.flash-player-container :deep(ruffle-player),
.flash-player-container :deep(canvas),
.flash-player-container :deep(ruffle-container),
.flash-player-container :deep(div) {
  background: transparent !important;
}
</style>
