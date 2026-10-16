<template>
  <div class="flash-root">
    <FlashPlayer
      :key="playerKey"
      :src="currentSrc"
      @loaded="onSwfLoaded"
    />

    <!-- 文字气泡：覆盖在动画上方 -->
    <SpeechBubble :text="bubble.text" :visible="bubble.visible" />

    <!-- 透明覆盖层：铺满窗口，负责接收鼠标事件（点击 + 拖动 + 右键） -->
    <div
      class="overlay"
      @pointerdown="onOverlayPointerDown"
      @pointerup="onOverlayPointerUp"
      @pointercancel="onOverlayPointerUp"
      @click="onOverlayClick"
      @contextmenu.prevent="onOverlayContextMenu"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { usePetMachine } from './composables/usePetMachine'
import FlashPlayer from './components/FlashPlayer.vue'
import SpeechBubble from './components/SpeechBubble.vue'

const {
  currentSrc, playerKey, bubble, dispatch,
  startAuto, stopAuto, applyRealDuration,
  stage, level, exp, addExp, adopted,
  dockedEdge, undock
} = usePetMachine()

let unsubscribeMenu = null
let unsubscribeAction = null

// FlashPlayer 上报 SWF 真实时长（毫秒）→ 状态机按真实播放进度切回 Stand
function onSwfLoaded(durationMs) {
  applyRealDuration(durationMs)
}

// 左键按下：开始拖动窗口（主进程用屏幕坐标持续移动）+ 播放"被拎起"动画
function onOverlayPointerDown(e) {
  if (e.button === 0) {
    // 贴边隐藏中：按下并拖动才打断，解除贴边回 Stand（悬浮移动不打断）
    if (dockedEdge.value) undock()
    // 指针捕获：即使鼠标移出窗口，也会收到 pointerup 事件
    try {
      e.target.setPointerCapture(e.pointerId)
    } catch (_) {
      /* 忽略 */
    }
    window.api.windowDragStart()
  }
}

function onOverlayPointerUp(e) {
  if (e.button === 0) {
    window.api.windowDragEnd()
  }
}

// 单击：点击互动（随机播 interact 动画，无素材时回退闲聊）
function onOverlayClick() {
  dispatch('interact')
}

// 右键：触发主进程弹原生菜单
function onOverlayContextMenu() {
  window.api.showContextMenu()
}

onMounted(() => {
  // 调试：输出当前等级/经验/阶段/是否已领养
  console.debug(`等级 ${level.value} 经验 ${exp.value} 阶段 ${stage.value} 已领养 ${adopted.value}`)
  // 启动即同步托盘图标性别（stage 前缀即 GG/MM），已领养的宠物重启后托盘图标随性别
  window.api.setTrayGender(stage.value.split('/')[0])
  // 订阅右键菜单里的"宠物状态动作"（喂食/清洁/闲聊/升级）。height 为拖动贴边时的鼠标高度，仅贴边动作使用
  unsubscribeAction = window.api.onPetAction((action, height) => dispatch(action, height))
  // 备用：订阅选择 SWF 事件（右键"选择 SWF 播放…"）
  unsubscribeMenu = window.api.onMenuSelected((filePath) => {
    if (filePath) {
      dispatch({ type: 'custom', path: filePath })
    }
  })

  // 尚未领养：先隐藏宠物窗口，只弹出"领养选择窗"（选性别+命名）。
  // 宠物窗与领养窗不同时出现；领养动作（type:'adopt'）到来后由状态机显示宠物窗并播放 First 出生动画。
  if (!adopted.value) {
    window.api.hidePet()
    window.api.openPetSelect()
    return
  }

  // 已领养：宠物窗初始为 show:false，此处显示窗口（未领养分支已在上面隐藏并开领养窗）
  window.api.showPet()
  // 启动进场：无论当前等级/阶段，先播放对应阶段的 Enter 动画，播完回 Stand
  dispatch('enter')
  // 默认启用自动循环（占位核心逻辑；后续接真实 QQ 事件时可关闭）
  startAuto()
})
onBeforeUnmount(() => {
  unsubscribeAction?.()
  unsubscribeMenu?.()
  stopAuto()
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
  background: transparent !important;
  overflow: hidden !important;
  display: block !important;
  -webkit-user-select: none;
  user-select: none;
  cursor: pointer;
}

.flash-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: transparent;
  overflow: hidden;
}

/* 透明覆盖层：铺满窗口，背景透明不影响观看，负责接收鼠标事件 */
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  background: transparent;
  cursor: pointer;
}

.flash-container {
  width: 100%;
  height: 100%;
}
</style>