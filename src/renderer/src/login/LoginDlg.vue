<template>
  <div class="login" :style="{ backgroundImage: `url(${imgs.bg})` }">
    <!-- 广告图 -->
    <img v-if="imgs.adv1" class="adv1" :src="imgs.adv1" alt="" draggable="false" />
    <!-- 提示文案图 -->
    <img v-if="imgs.pictext" class="pictext" :src="imgs.pictext" alt="" draggable="false" />

    <!-- QQ 号输入框 -->
    <div class="input-box" style="top: 128px">
      <input
        ref="qqInput"
        v-model="qq"
        class="ipt dark"
        :class="{ focus: qqFocus }"
        :style="qqFocus ? bgFocusStyle : bgNormalStyle"
        type="text"
        maxlength="11"
        placeholder="QQ号码"
        @focus="qqFocus = true"
        @blur="qqFocus = false"
        @keydown.enter="doLogin"
      />
    </div>

    <!-- 密码输入框 -->
    <div class="input-box" style="top: 151px">
      <input
        v-model="pwd"
        class="ipt"
        :class="{ focus: pwdFocus }"
        :style="pwdFocus ? bgFocusStyle : bgNormalStyle"
        type="password"
        maxlength="20"
        placeholder="密码"
        @focus="pwdFocus = true"
        @blur="pwdFocus = false"
        @keydown.enter="doLogin"
      />
    </div>

    <!-- 记住密码 / 自动登录 -->
    <div class="chk-row">
      <label class="chk"><input type="checkbox" v-model="remember" /> 记住密码</label>
      <label class="chk"><input type="checkbox" v-model="autoLogin" /> 自动登录</label>
    </div>

    <!-- 分隔线 -->
    <div v-if="imgs.line" class="line" :style="{ backgroundImage: `url(${imgs.line})` }"></div>

    <!-- 错误提示（右侧边栏，避免遮挡输入/按钮） -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 登录 / 取消 按钮 -->
    <div class="btn" style="left: 96px; top: 206px">
      <img
        :src="loginState === 2 ? imgs.login_02 : loginState === 1 ? imgs.login_01 : imgs.login_00"
        alt="登录"
        draggable="false"
        @mouseenter="loginState = 1"
        @mouseleave="loginState = 0"
        @mousedown="loginState = 2"
        @mouseup="loginState = 1"
        @click="doLogin"
      />
    </div>
    <div class="btn" style="left: 190px; top: 206px">
      <img
        :src="cancelState === 2 ? imgs.cancel_02 : cancelState === 1 ? imgs.cancel_01 : imgs.cancel_00"
        alt="取消"
        draggable="false"
        @mouseenter="cancelState = 1"
        @mouseleave="cancelState = 0"
        @mousedown="cancelState = 2"
        @mouseup="cancelState = 1"
        @click="doCancel"
      />
    </div>

    <!-- 关闭按钮 -->
    <div class="close-btn" style="right: 10px; top: 30px">
      <img
        :src="closeState === 2 ? imgs.close_02 : closeState === 1 ? imgs.close_01 : imgs.close_00"
        alt="关闭"
        draggable="false"
        @mouseenter="closeState = 1"
        @mouseleave="closeState = 0"
        @mousedown="closeState = 2"
        @mouseup="closeState = 1"
        @click="doCancel"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

// 演示账号占位：真实部署时改为调用后端校验接口（window.api.login 对应新 IPC）
const LOGIN_ACCOUNT = { qq: '123456', pwd: '123456' }

const imgs = reactive({})
const qq = ref('')
const pwd = ref('')
const remember = ref(false)
const autoLogin = ref(false)
const error = ref('')
const qqFocus = ref(false)
const pwdFocus = ref(false)
const loginState = ref(0)
const cancelState = ref(0)
const closeState = ref(0)

const bgNormalStyle = { backgroundImage: '' }
const bgFocusStyle = { backgroundImage: '' }

// 登录窗为固定 340×242；QQ 号输入框深色背景，密码框白色背景
async function loadImages() {
  const base = 'assets/login/UI/'
  const keys = {
    bg: 'loginbg.png', adv1: 'adv1.png', pictext: 'pictext.png', line: 'line.png',
    editbg_00: 'editbg_00.png', editbg_01: 'editbg_01.png',
    login_00: 'Button_login_00.png', login_01: 'Button_login_01.png', login_02: 'Button_login_02.png',
    cancel_00: 'Button_cancel_00.png', cancel_01: 'Button_cancel_01.png', cancel_02: 'Button_cancel_02.png',
    close_00: 'Button_close_00.png', close_01: 'Button_close_01.png', close_02: 'Button_close_02.png'
  }
  for (const [k, f] of Object.entries(keys)) {
    try {
      imgs[k] = await window.api.readImage(base + f)
    } catch (_) {
      imgs[k] = ''
    }
  }
  bgNormalStyle.backgroundImage = imgs.editbg_00 ? `url(${imgs.editbg_00})` : 'none'
  bgFocusStyle.backgroundImage = imgs.editbg_01 ? `url(${imgs.editbg_01})` : 'none'
}

// 真实格式校验：QQ 号 5~11 位纯数字、密码非空
function validate() {
  const acc = qq.value.trim()
  if (!/^\d{5,11}$/.test(acc)) return '请输入 5~11 位的 QQ 号码'
  if (!pwd.value) return '请输入密码'
  // if (!(acc === LOGIN_ACCOUNT.qq && pwd.value === LOGIN_ACCOUNT.pwd)) return 'QQ号码或密码错误'
  return null
}

function doLogin() {
  error.value = validate()
  if (error.value) {
    if (error.value.includes('密码')) pwd.value = ''
    return
  }
  persist()
  window.api.loginDone()
}

function persist() {
  try {
    if (remember.value) {
      localStorage.setItem('qqpet.savedQq', qq.value.trim())
      localStorage.setItem('qqpet.savedPwd', pwd.value)
      localStorage.setItem('qqpet.remember', '1')
    } else {
      localStorage.removeItem('qqpet.savedQq')
      localStorage.removeItem('qqpet.savedPwd')
      localStorage.removeItem('qqpet.remember')
    }
    localStorage.setItem('qqpet.autoLogin', autoLogin.value ? '1' : '0')
  } catch (_) {
    /* ignore */
  }
}

function doCancel() {
  window.api.loginCancel()
}

onMounted(async () => {
  await loadImages()
  // 填充记住的账号密码
  try {
    if (localStorage.getItem('qqpet.remember') === '1') {
      remember.value = true
      qq.value = localStorage.getItem('qqpet.savedQq') || ''
      pwd.value = localStorage.getItem('qqpet.savedPwd') || ''
    }
    autoLogin.value = localStorage.getItem('qqpet.autoLogin') === '1'
  } catch (_) {
    /* ignore */
  }
  // 自动登录：自动提交
  if (autoLogin.value) setTimeout(() => doLogin(), 300)
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

.login {
  position: relative;
  width: 340px;
  height: 242px;
  background-size: 100% 100%;
  box-sizing: border-box;
}

.adv1 { position: absolute; left: 2px; top: 54px; width: 336px; height: 66px; }
.pictext { position: absolute; left: 28px; top: 130px; width: 55px; height: 40px; }

.input-box { position: absolute; left: 96px; width: 150px; height: 19px; }
.ipt {
  width: 150px;
  height: 19px;
  border: none;
  outline: none;
  box-sizing: border-box;
  padding: 0 6px;
  font-size: 12px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-color: #ffffff;
  color: #000;
  /* caret-color: #000; */
  -webkit-user-select: text;
  user-select: text;
}
.ipt.dark { background-color: #666666; color: #060606; }
.ipt.dark::placeholder { color: #ccc; }
.ipt::placeholder { color: #999; }

.chk-row { position: absolute; left: 96px; top: 175px; display: flex; align-items: center; gap: 22px; }
.chk { display: flex; align-items: center; gap: 2px; font-size: 11px; color: #8e580a; cursor: pointer; }
.chk input { cursor: pointer; }

.line { position: absolute; left: 10px; top: 200px; width: 325px; height: 1px; background-size: 100% 100%; }

/* 错误提示放在右侧边栏，避免遮挡输入框与按钮 */
.error {
  position: absolute;
  left: 258px;
  top: 128px;
  width: 80px;
  font-size: 11px;
  color: #d0342c;
  line-height: 15px;
  word-break: break-all;
}

.btn { position: absolute; width: 64px; height: 22px; cursor: pointer; }
.btn img { display: block; width: 64px; height: 22px; }
.close-btn{ position: absolute; width: 22px; height: 22px; cursor: pointer; }
.close-btn img { display: block; width: 22px; }

</style>