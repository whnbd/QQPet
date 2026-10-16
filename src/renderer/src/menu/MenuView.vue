<template>
  <div class="menu-root" @contextmenu.prevent>
    <div class="menu-panel">
      <!-- 顶部圆顶把手（还原 QQ 宠物圆顶小菜单） -->
      <div class="dome"></div>

      <div
        v-for="(it, i) in items"
        :key="it.action || i"
        class="menu-item"
        :class="{ sep: it.sep }"
        :data-action="it.action || ''"
        @click="onClick(it)"
      >
        <span v-if="it.sep" class="sep-line"></span>
        <template v-else>
          <span class="item-dot"></span>
          <span class="item-label">{{ it.label }}</span>
          <span v-if="it.check" class="item-check" :class="{ on: isChecked(it) }">✓</span>
        </template>
      </div>

      <div class="dome-bottom"></div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
// QQ宠物风格右键菜单：半透明深蓝渐变圆角面板 + 圆顶，白字菜单项，悬浮高亮。
// 点击某项 → 通过 IPC 转发动作给宠物窗口并关闭本菜单窗口。
// 置顶/穿透为勾选项：切换由主进程处理，菜单保持打开、勾选态实时刷新。
const items = [
  { action: 'eat', label: '喂食' },
  { action: 'clean', label: '清洁' },
  { action: 'work1h', label: '打工1小时' },
  { action: 'work15m', label: '打工15分钟' },
  { action: 'speak', label: '闲聊' },
  { action: 'levup', label: '升级' },
  { action: 'cure', label: '治疗' },
  { action: 'stat', label: '查看状态' },
  { action: 'bag', label: '背包' },
  { action: 'info', label: '宠物信息' },
  // { action: 'revival', label: '复活' },
  { sep: true },
  { action: 'shop', label: '商店' },
  { action: 'game', label: '小游戏' },
  { sep: true },
  { action: 'toggle-always-on-top', label: '宠物置顶', check: true },
  { action: 'toggle-mouse-through', label: '鼠标穿透', check: true },
  { sep: true },
  { action: 'exit', label: '退出' }
]

// 置顶/穿透勾选状态：打开时读取主进程持久化值，切换后由主进程广播刷新
const prefs = reactive({ alwaysOnTop: false, mouseThrough: false })
window.api.getWindowPrefs().then((p) => {
  prefs.alwaysOnTop = !!p.alwaysOnTop
  prefs.mouseThrough = !!p.mouseThrough
})
window.api.onWindowPrefsChanged((p) => {
  prefs.alwaysOnTop = !!p.alwaysOnTop
  prefs.mouseThrough = !!p.mouseThrough
})

function isChecked(it) {
  if (it.action === 'toggle-always-on-top') return prefs.alwaysOnTop
  if (it.action === 'toggle-mouse-through') return prefs.mouseThrough
  return false
}

function onClick(it) {
  if (!it.action) return
  window.api.contextMenuAction(it.action)
}

// 失焦自动关闭由主进程 blur 处理；这里额外监听下 Esc 键
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeSelf()
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
  -webkit-user-select: none;
  user-select: none;
  font-family: 'Microsoft YaHei', sans-serif;
}

.menu-root {
  position: relative;
  width: 100%;
  height: 90%;
  display: flex;
  justify-content: center;
}

/* 半透明深蓝渐变圆角面板（QQ 宠物经典小菜单质感） */
.menu-panel {
  position: relative;
  width: 138px;
  min-height: 360px;
  margin-top: 4px;
  border-radius: 12px;
  padding: 10px 4px 8px;
  box-sizing: border-box;
  background: linear-gradient(180deg, rgba(44, 66, 128, 0.96) 0%, rgba(74, 104, 176, 0.94) 55%, rgba(48, 72, 140, 0.96) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.18) inset,
    0 6px 18px rgba(0, 0, 20, 0.45);
  border: 1px solid rgba(160, 190, 255, 0.35);
}

/* 顶部圆顶 */
.dome {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 34px;
  height: 10px;
  margin-top: -9px;
  border-radius: 12px 12px 4px 4px;
  background: linear-gradient(180deg, rgba(58, 84, 158, 0.98), rgba(74, 104, 176, 0.96));
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 8px 0 6px;
  border-radius: 7px;
  cursor: pointer;
  color: #fff;
  font-size: 13px;
  letter-spacing: 1px;
  margin: 1.5px 0;
}

.menu-item:not(.sep):hover {
  background: linear-gradient(90deg, rgba(120, 170, 255, 0.4), rgba(96, 138, 232, 0.3));
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25) inset;
}

.menu-item:active {
  background: linear-gradient(90deg, rgba(150, 195, 255, 0.5), rgba(110, 155, 245, 0.4));
}

/* 分类分隔线 */
.menu-item.sep {
  height: 10px;
  pointer-events: none;
}
.sep-line {
  display: block;
  width: 100%;
  height: 1px;
  margin: 4px 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0));
}

/* 左侧小圆点（Q宠菜单项风格指示点） */
.item-dot {
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, rgba(180, 210, 255, 0.9));
  box-shadow: 0 0 4px rgba(180, 210, 255, 0.8);
  flex: none;
}

.menu-item:hover .item-dot {
  background: radial-gradient(circle at 35% 30%, #fffbe6, #ffd76a);
  box-shadow: 0 0 6px rgba(255, 216, 100, 0.9);
}

.item-label {
  line-height: 1;
}

/* 勾选项右侧对勾标记（置顶/穿透）：未开启时隐藏，开启时高亮显示 */
.item-check {
  margin-left: auto;
  font-size: 13px;
  color: rgba(255, 255, 255, 0);
  transition: color 0.15s;
  padding-right: 2px;
}
.item-check.on {
  color: #ffd76a;
  text-shadow: 0 0 6px rgba(255, 216, 100, 0.9);
}
.menu-item:hover .item-check.on {
  color: #ffe9a8;
}
</style>