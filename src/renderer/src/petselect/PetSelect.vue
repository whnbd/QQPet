<template>
  <div class="ps">
    <!-- 顶部拖拽栏 -->
    <div class="ps-top">
      <span class="ps-title">领养一只 QQ 宠物</span>
      <span class="close-btn" @click="cancel">×</span>
    </div>

    <div class="ps-body">
      <div class="ps-tip">选择宝贝的性别，并给它起个名字～</div>

      <!-- 性别卡片 -->
      <div class="cards">
        <div class="card" :class="{ on: gender === 'GG' }" @click="gender = 'GG'">
          <div class="pv"><FlashPlayer :src="'assets/Action/GG/Egg/Stand.swf'" /></div>
          <div class="lbl">QGG</div>
        </div>
        <div class="card" :class="{ on: gender === 'MM' }" @click="gender = 'MM'">
          <div class="pv"><FlashPlayer :src="'assets/Action/MM/Egg/Stand.swf'" /></div>
          <div class="lbl">QMM</div>
        </div>
      </div>

      <!-- 命名 -->
      <div class="name-row">
        <span class="lbl">名字</span>
        <input
          ref="nameInput"
          v-model="name"
          class="ipt"
          maxlength="10"
          placeholder="输入名字"
          @keydown.enter="adopt"
        />
      </div>

      <div v-if="err" class="err">{{ err }}</div>

      <button class="adopt-btn" :disabled="!gender || !name.trim()" @click="adopt">领养</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FlashPlayer from '../components/FlashPlayer.vue'

const gender = ref('GG')
const name = ref('')
const err = ref('')

function adopt() {
  if (!gender.value) { err.value = '请选择宝贝的性别'; return }
  if (!name.value.trim()) { err.value = '请给宝贝起个名字'; return }
  // 先写入本窗口 localStorage（选择窗与宠物窗共享同一 partition，宠物窗会读到）
  try {
    localStorage.setItem('qqpet.gender', gender.value)
    localStorage.setItem('qqpet.name', name.value.trim())
    localStorage.setItem('qqpet.adopted', '1')
  } catch (_) { /* ignore */ }
  // 通知主进程 → 宠物窗开始播放对应性别的 First 出生动画
  window.api.adoptPet({ gender: gender.value, name: name.value.trim() })
}

function cancel() {
  window.api.closeSelf()
}
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

.ps {
  position: relative;
  width: 480px;
  height: 430px;
  box-sizing: border-box;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(160deg, #fff4e0 0%, #ffe9c8 45%, #ffd9ee 100%);
  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.6);
}

.ps-top {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.35);
  -webkit-app-region: drag;
  box-sizing: border-box;
}
.ps-title { font-size: 17px; font-weight: 700; color: #b06a2b; letter-spacing: 1px; }
.close-btn {
  -webkit-app-region: no-drag;
  width: 20px; height: 20px; line-height: 18px; text-align: center;
  border-radius: 50%; background: rgba(255, 255, 255, 0.7); color: #a06a2b;
  cursor: pointer; font-size: 15px;
}
.close-btn:hover { background: #ffb36b; color: #fff; }

.ps-body { padding: 10px 22px 14px; box-sizing: border-box; }
.ps-tip { text-align: center; font-size: 13px; color: #a06a2b; margin-bottom: 8px; }

.cards { display: flex; gap: 18px; justify-content: center; }
.card {
  width: 170px; height: 190px; border-radius: 14px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; padding: 8px;
  background: rgba(255, 255, 255, 0.55); border: 2px solid transparent; transition: all 0.15s;
}
.card:hover { transform: translateY(-2px); }
.card.on { border-color: #ff9a3c; background: rgba(255, 255, 255, 0.85); box-shadow: 0 4px 14px rgba(255, 154, 60, 0.35); }
.pv { width: 150px; height: 150px; }
.lbl { margin-top: 4px; font-size: 14px; font-weight: 700; color: #8a5a28; }

.name-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px; }
.name-row .lbl { font-size: 14px; color: #8a5a28; font-weight: 600; }
.ipt {
  width: 230px; height: 28px; border: 1px solid #e6c08a; border-radius: 8px;
  padding: 0 10px; font-size: 13px; outline: none; background: #fff; color: #333;
  -webkit-user-select: text; user-select: text;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
}
.ipt:focus { border-color: #ff9a3c; }

.err { text-align: center; color: #e04a2b; font-size: 12px; margin-top: 6px; height: 16px; }

.adopt-btn {
  display: block; margin: 4px auto 0; width: 200px; height: 36px; cursor: pointer;
  border: none; border-radius: 18px; font-size: 16px; font-weight: 700; letter-spacing: 2px;
  color: #fff; background: linear-gradient(135deg, #ff8f3c, #ff5e9e);
  box-shadow: 0 4px 12px rgba(255, 94, 158, 0.4);
}
.adopt-btn:disabled { filter: grayscale(0.8); opacity: 0.6; cursor: not-allowed; }
.adopt-btn:not(:disabled):hover { filter: brightness(1.05); }
.adopt-btn:not(:disabled):active { transform: translateY(1px); }
</style>