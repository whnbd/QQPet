import { ref, computed } from 'vue'

// 当前性别前缀：GG=公宠 / MM=母宠。首次登录领养时选定并持久化到 qqpet.gender。
// 用可变的模块级变量，领养后才确定，各阶段路径在调用时取当前值。
let GENDER = localStorage.getItem('qqpet.gender') || 'GG'

// 等级 → 阶段（目录前缀）。蛋期 Egg → 5级破壳 Kid → 10级 Adult
const stageFromLevel = (lvl) =>
  lvl >= 10 ? `${GENDER}/Adult` : lvl >= 5 ? `${GENDER}/Kid` : `${GENDER}/Egg`

// 升级所需经验表：index=当前等级（1 起），到该值时升到下一级
const LEVEL_EXP = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]
// 跨阶段进化阈值：达到这些等级即进化为对应阶段（按当前性别动态求值）
const EVOLVE_AT = (lvl) => (lvl === 5 ? `${GENDER}/Kid` : lvl === 10 ? `${GENDER}/Adult` : null)

// 状态 → SWF & 文案类别。
// 动画「播放时长」不在此写死，由 FlashPlayer 读 SWF 文件头解析真实时长后 applyRealDuration 覆盖。
// swf=默认(Egg/Kid 平铺目录)文件名；adult=Adult 根目录(带序号)文件名。
const STATES = {
  stand: { swf: 'Stand.swf', bubble: null },
  eat: { swf: 'Eat1.swf', adult: 'Eat1.swf', bubble: 'Eat' },
  clean: { swf: 'Clean.swf', adult: 'Clean1.swf', bubble: 'Clean' },
  sick: { swf: 'Sick.swf', adult: 'Sick1.swf', bubble: 'SmallTalk' },
  cure: { swf: 'Cure.swf', adult: 'Cure1.swf', bubble: null },
  levup: { swf: 'LevUp.swf', adult: 'LevUp.swf', bubble: 'LevUp' },
  appear: { swf: 'Appear.swf', bubble: 'Enter' },
  enter: { swf: 'Enter1.swf', adult: 'Enter1.swf', bubble: null }, // 进场（启动播放）
  exit: { swf: 'Exit1.swf', adult: 'Exit1.swf', bubble: null },    // 离场（退出播放）
  die: { swf: 'Die.swf', bubble: null },       // 死亡：健康=0 时播放并保持
  revival: { swf: 'Revival.swf', bubble: 'Revival' }, // 复活：右键触发，播完回 Stand
  // 仅气泡不切动画：气泡显示时长
  speak: { swf: null, bubble: 'SmallTalk', bubbleMs: 3500 }
}

// Adult 阶段"心情敏感"的素材：位于心情子目录（happy/.../xxx.swf），需拼心情路径
const MOOD_SENSITIVE = { 'Stand.swf': 1, 'Stand1.swf': 1, 'Speak.swf': 1, 'Appear.swf': 1, 'Hide.swf': 1 }

// 文件头解析失败时的安全兜底：设置一个足够长的上限避免永久卡住。
// 正常情况 FlashPlayer 会上报真实时长覆盖它，此值不会提前切走动画。
const SWF_DUR_FALLBACK = 30000

// 随机选取气泡文案：txt 多行，仅取第一行宠物说话，丢弃末尾玩家回复行
async function randomBubble(category) {
  if (!category) return null
  try {
    const files = await window.api.listTxt(category)
    if (!files.length) return null
    const file = files[Math.floor(Math.random() * files.length)]
    const raw = await window.api.readTxt(`${category}/${file}`)
    // 以换行分隔，取第一行作为宠物说话
    const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0)
    if (!firstLine) return null
    // [host] 占位符 → 玩家称呼（默认"主人"，后续可接真实昵称）
    return firstLine.replace(/\[host\]/g, '主人')
  } catch (_) {
    return null
  }
}

export function usePetMachine() {
  // 【临时】测试用：每次启动清空进度，方便重复体验升级/进化。测完删除本行。
  // localStorage.clear()

  // 等级 / 经验 / 当前阶段（从 localStorage 恢复，重启不回落）
  const level = ref(Number(localStorage.getItem('qqpet.level')) || 1)
  const exp = ref(Number(localStorage.getItem('qqpet.exp')) || 0)
  const stage = ref(stageFromLevel(level.value))

  // 属性：饥饿(饱食)/健康/清洁 0–100，localStorage 持久化
  const clamp100 = (v) => Math.max(0, Math.min(100, Math.floor(Number(v) || 0)))
  const hunger = ref(clamp100(localStorage.getItem('qqpet.hunger') || 100))
  const clean = ref(clamp100(localStorage.getItem('qqpet.clean') || 100))
  const health = ref(clamp100(localStorage.getItem('qqpet.health') || 100))

  // 金币：打工获得、商店消费，localStorage 持久化（商店窗口同 partition 共享此键）。
  // 以 localStorage 为唯一数据源，避免多窗口同时改造成覆盖丢失。
  const coinsStored = localStorage.getItem('qqpet.coins')
  // 初始元宝 150；仅当从未存过键时使用默认值（避免已消耗到 0 时被误还原成 150）
  const coins = ref(coinsStored === null ? 150 : (Number(coinsStored)  || 0))
  // 首次启动时把默认 150 元宝落盘，确保商店/小游戏窗口（直接读 localStorage）读到一致的值
  if (coinsStored === null) localStorage.setItem('qqpet.coins', String(coins.value))


  // 心情值：0–1000，localStorage 持久化（原版 QQ 宠物设定）。
  // 影响成长经验加成：兴奋900–1000→+30%、高兴600–899→+10%、其余→0%。
  // 喂食/洗澡 +20，玩小游戏 +50，点击互动按当前心情档位递增。
  const clampMood = (v) => Math.max(0, Math.min(1000, Math.floor(Number(v) || 0)))
  const moodVal = ref(clampMood(localStorage.getItem('qqpet.moodval') || 1000))
  // 心情档位（按数值）→ 加成倍率
  function moodBand(mv) {
    if (mv >= 900) return { name: '兴奋', mul: 1.3 }
    if (mv >= 600) return { name: '高兴', mul: 1.1 }
    return { name: '平静', mul: 1.0 }
  }
  // 按心情档位递增点击互动获得的心情值（兴奋只 +5，低落 +70）
  function moodClickGain(mv) {
    if (mv >= 900) return 5
    if (mv >= 600) return 10
    if (mv >= 400) return 30
    if (mv >= 200) return 50
    return 70
  }
  function addMood(n) {
    const v = clampMood(moodVal.value + (Number(n) || 0))
    if (v !== moodVal.value) {
      moodVal.value = v
      localStorage.setItem('qqpet.moodval', String(v))
    }
  }

  // 死亡功能开关：暂时关闭死亡（健康到 0 也不会死），调试/体验期方便；恢复死亡时改回 true
  const DEATH_ENABLED = false

  // ===== 属性衰减速度配置 =====
  // 含义：对应属性每 N 秒衰减 1 点。数值调大 = 衰减越慢，调小 = 衰减越快。
  const DECAY = {
    hunger: 1800,  // 饱食度：每 10s -1（≈每分钟 -6）
    clean: 1800,   // 清洁度：每 18s -1（≈每分钟 -3.3）
    health: 30,  // 健康度：饥饿或清洁 <20 时，每 12s -1
    mood: 1200      // 心情：饥饿或清洁 <30 时，每 4s -1（≈每分钟 -15）
  }

  // 死亡标记：健康=0 时置 true，保持死亡形态；仅"复活"可解除
  // 关闭死亡时：启动若健康已 ≤0，强制回 1，避免重启后仍处于死亡态
  if (!DEATH_ENABLED && health.value <= 0) health.value = 1
  const dead = ref(DEATH_ENABLED && health.value <= 0)

  // 是否已领养宠物（首次登录领养后才为 true）。未领养时不进入自动循环，等待领养。
  const adopted = ref(localStorage.getItem('qqpet.adopted') === '1')
  // 宠物昵称（领养时设定，存储于 qqpet.name）
  const petName = ref(localStorage.getItem('qqpet.name') || '')

  // 生病阈值：健康 ≤ 该值时进入生病态。
  // 生病时不播 play 动画（全阶段）；Egg/Kid 生病时 standby 恒用 Sick.swf（不播 Stand）。
  const SICK_AT = 30
  const sick = computed(() => !dead.value && health.value <= SICK_AT)

  // 心情（仅 Adult 生效）：以「心情值」为主决定显形表情目录，仅在健康濒危时用状态兜底。
  // 心情档位：兴奋≥900 / 高兴≥600 → happy；平静≥400 → peaceful；郁闷≥200 → sad；低落<200 → upset。
  // 饥饿/清洁过低不会立刻变脸，而是通过 statTick 让心情值随时间下降，掉到对应档位才切换表情（与设定一致）。
  const mood = ref('peaceful')
  function moodFromStats() {
    if (health.value <= 20) return 'prostrate' // 健康濒危兜底（始终最高优先）
    if (moodVal.value >= 600) return 'happy'   // 兴奋 / 高兴
    if (moodVal.value >= 400) return 'peaceful' // 平静
    if (moodVal.value >= 200) return 'sad'     // 郁闷
    return 'upset'                              // 低落
  }
  function syncMood() {
    const m = moodFromStats()
    if (m !== mood.value) mood.value = m
  }

  // 当前贴边隐藏的边缘（'left'|'right'|null）。
  // 贴边后窗口保持可见可拖离；被拖离边缘后由主进程通知回 Stand（并清空此标记）。
  const dockedEdge = ref(null)

  // 解析某阶段某状态动画的完整相对路径：
  // Adult 的"心情敏感"文件套当前心情子目录；其余动作（Eat/Clean/Sick/Cure/LevUp）用阶段根目录。
  function statePath(stage, file) {
    if (stage.endsWith('/Adult') && MOOD_SENSITIVE[file]) {
      return `assets/Action/${stage}/${mood.value}/${file}`
    }
    return `assets/Action/${stage}/${file}`
  }
  // 当前阶段下某状态动画文件（处理 Egg/Kid 与 Adult 文件名差异 + 心情目录）
  function currentStateSwf(conf) {
    const file = stage.value.endsWith('/Adult') ? (conf.adult || conf.swf) : conf.swf
    return statePath(stage.value, file)
  }

  // 当前播放的 SWF 相对路径（FlashPlayer 的 src），用当前阶段的 Stand 作为初始
  const currentSrc = ref(statePath(stage.value, 'Stand.swf'))
  const playerKey = ref(0) // 改 key 强制重建播放器
  // 气泡
  const bubble = ref({ visible: false, text: '' })

  let backTimer = null // 动作播完回 Stand 的定时器
  let adoptingFirst = false // 刚领养、正在播 First 出生动画；此期间点退出直接退出。被任何播放动作（隐藏/喂食/打工等）打断后清除，退出恢复播 Exit 动画
  let bubbleTimer = null
  let autoTimer = null
  let autoEnabled = false
  let autoResume = false // 用户手动动作播完后是否恢复自动循环
  let awaitingMeta = false // 正在等待 FlashPlayer 上报真实时长（当前动作切了新 SWF）
  let evolving = false // 正在进化中，屏蔽其它经验/动作
  let onSwfDone = null // 当前 SWF 播完后的回调（动作回 Stand 或进化切阶段）

  // —— 动画"播完才切换" --
  // animBusy=true 表示当前正有一段动作动画在播放（非 Stand 空闲），此时收到的新动作不排队、
  // 不等待、直接忽略，避免打断当前动画；当前动画播完后回到空闲，新动作即可正常执行。
  let animBusy = false

  // 持久化等级/经验/属性
  function persistLevel() {
    localStorage.setItem('qqpet.level', String(level.value))
    localStorage.setItem('qqpet.exp', String(exp.value))
    localStorage.setItem('qqpet.hunger', String(hunger.value))
    localStorage.setItem('qqpet.clean', String(clean.value))
    localStorage.setItem('qqpet.health', String(health.value))
    localStorage.setItem('qqpet.moodval', String(moodVal.value))
  }

  function clearTimers() {
    if (backTimer) { clearTimeout(backTimer); backTimer = null }
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  }

  // 隐藏气泡
  function hideBubble() {
    bubble.value.visible = false
    bubble.value.text = ''
  }

  // 若此前是用户手动动作且自动循环已被暂停，则在动作播完后恢复自动循环
  function maybeResumeAuto() {
    if (autoResume && !autoEnabled) {
      autoResume = false
      startAuto()
    }
  }

  // 结束当前动作：切回 Stand，或 keepSwf 时仅隐藏气泡
  function finishAction(keepSwf) {
    awaitingMeta = false
    if (!keepSwf) backToStand() // backToStand 内部会清 animBusy
    else {
      hideBubble()
      animBusy = false
      maybeResumeAuto()
    }
  }

  // FlashPlayer 上报 SWF 文件头解析出的真实时长（毫秒）：按真实播放进度触发完成回调。
  // 若解析失败（ms 无效），回退到安全兜底时长，避免永久等待。
  function applyRealDuration(ms) {
    if (!awaitingMeta) return
    awaitingMeta = false
    if (backTimer) clearTimeout(backTimer)
    const target = ms && ms > 0 ? ms : SWF_DUR_FALLBACK
    const done = onSwfDone || (() => finishAction(false))
    backTimer = setTimeout(done, target)
  }

  // 播放一个动作状态：切 SWF + 气泡，到时回 Stand
  async function play(state, opts = {}) {
    adoptingFirst = false // 领养动画被手动动作打断后，退出恢复播放 Exit 动画
    clearTimers()
    const conf = STATES[state]
    if (!conf) { backToStand(); return }
    const { keepSwf, user } = opts // keepSwf=true 不换 SWF（如下只能聊仅出气泡）；user=true 为手动操作

    // 用户手动动作：暂停自动循环，避免自动循环打断；记录待恢复
    if (user && autoEnabled) {
      stopAuto()
      autoResume = true
    }

    // 切 SWF（除非 keepSwf 或该状态无动画）
    if (!keepSwf && conf.swf) {
      syncMood()
      currentSrc.value = currentStateSwf(conf)
      playerKey.value++
      animBusy = true // 进入动作动画播放，期间新动作排队
      awaitingMeta = true // 等待 FlashPlayer 上报文件头解析出的真实时长
      onSwfDone = () => finishAction(false)
      // 安全兜底：仅文件头解析失败时才走到这里；正常会被 applyRealDuration 覆盖
      backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK)
    }

    // 气泡
    const text = opts.text || (await randomBubble(conf.bubble))
    if (text) {
      bubble.value.text = text
      bubble.value.visible = true
      const bubbleMs = conf.bubbleMs || 3000
      bubbleTimer = setTimeout(() => {
        bubble.value.visible = false
      }, bubbleMs)
    }

    // 仅说话、不切动画（keepSwf / speak）：按气泡时长结束本次交互
    if (keepSwf) {
      const ms = conf.bubbleMs || 2500
      backTimer = setTimeout(() => finishAction(true), ms)
    }
  }

  // 立即回到闲置态（用当前阶段的 Stand 动画；Adult 走心情子目录并可随机 Stand/Stand1）
  function backToStand() {
    studying.value = false // 学习动画中断/结束后不保持学习状态
    awaitingMeta = false
    onSwfDone = null
    clearTimers()
    hideBubble()
    syncMood()
    dockedEdge.value = null // 解除贴边隐藏标记
    animBusy = false // 已回到空闲
    const isAdult = stage.value.endsWith('/Adult')
    // Egg/Kid 生病：不播 Stand，standby 恒为 Sick（保持病态画面）
    if (!isAdult && sick.value) {
      currentSrc.value = statePath(stage.value, 'Sick.swf')
      playerKey.value++
      return
    }
    const standFile = isAdult ? (Math.random() < 0.5 ? 'Stand.swf' : 'Stand1.swf') : 'Stand.swf'
    currentSrc.value = statePath(stage.value, standFile)
    playerKey.value++
  }

  // 贴边隐藏中：鼠标移动即可打断，解除贴边回 Stand（不受动画播放门禁限制）
  function undock() {
    if (!dockedEdge.value) return
    stopAuto()
    clearTimers()
    hideBubble()
    backToStand()
    startAuto()
  }

  // 不切动画，仅显示一句气泡一段时间
  function sayUntil(text, ms = 2500) {
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubble.value.text = text
    bubble.value.visible = true
    bubbleTimer = setTimeout(() => { bubble.value.visible = false }, ms)
  }

  // 查看状态：气泡播报属性与心情
  function sayStatus() {
    const m = stage.value.endsWith('/Adult') ? mood.value : ''
    if(m === '')
    {
      sayUntil(`饱食 ${hunger.value} 健康 ${health.value} 清洁 ${clean.value} 心情 ${moodVal.value}`, 4000)
      return
    }
    sayUntil(`饱食 ${hunger.value} 健康 ${health.value} 清洁 ${clean.value} 心情 ${moodVal.value}（${m}）`, 4000)
  }

  // 播放离场 Exit 动画，播完后通知主进程退出应用
  function playExitSwf() {
    stopAuto()
    clearTimers()
    hideBubble()
    currentSrc.value = currentStateSwf(STATES.exit)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => window.api.appQuit?.()
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 隐藏宠物：播放对应 Hide 动画。
  // - edge=null（原地隐藏，现行为）：播完隐藏窗口。
  // - edge='left'|'right'：先移窗到屏幕对应边缘（height 为拖动贴边时的鼠标高度，无则主进程随机），
  //   播完停留在边缘（可见可拖离），被拖离边缘时主进程会发 'pet-action','stand' 回来回 Stand。
  // Egg/Kid 用 Hide_left1/Hide_right1；Adult 用阶段根目录的 Hide_left/Hide_right。
  function playHide(edge, height) {
    adoptingFirst = false // 领养动画被隐藏打断后，退出恢复播放 Exit 动画
    stopAuto()
    clearTimers()
    hideBubble()
    const isAdult = stage.value.endsWith('/Adult')
    let file
    if (edge === 'left') file = isAdult ? 'Hide_left.swf' : 'Hide_left1.swf'
    else if (edge === 'right') file = isAdult ? 'Hide_right.swf' : 'Hide_right1.swf'
    else file = 'Hide.swf'
    currentSrc.value = statePath(stage.value, file)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    if (edge) {
      // 贴边：播完停留 docked，等待被拖离后回 Stand
      dockedEdge.value = edge
      onSwfDone = () => { awaitingMeta = false; animBusy = false }
    } else {
      // 原地隐藏：播完真正隐藏（维持现行为）
      onSwfDone = () => { window.api.hidePet?.(); animBusy = false }
    }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
    if (edge) window.api.moveToEdge?.(edge, height) // 先移窗到屏幕边缘（拖动贴边时与鼠标同高）
  }

  // 死亡：健康=0 时调用。播 Die 动画后保持死亡形态（停留在最后的死亡画面），
  // 停止自动循环、冻结属性衰减；除"复活/退出"外所有动作均被 dispatch 屏蔽。
  function goDie() {
    if (dead.value) return
    dead.value = true
    stopAuto()
    clearTimers()
    hideBubble()
    persistLevel()
    currentSrc.value = currentStateSwf(STATES.die)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => { awaitingMeta = false } // 保持死亡画面，不切回 Stand
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 复活：仅死亡态生效。播 Revival 动画，播完恢复健康并回 Stand，重启自动循环。
  function goRevive() {
    if (!dead.value) return
    dead.value = false
    health.value = 100 // 复活回满健康
    persistLevel()
    clearTimers()
    hideBubble()
    currentSrc.value = currentStateSwf(STATES.revival)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => {
      backToStand()
      startAuto() // 恢复正常自动循环
    }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 播放任意自定义动作 SWF（如 play/ 玩耍、interact/ 交互），可选气泡
  async function playCustom(folder, file, bubbleText, duration = 3000) {
    clearTimers()
    currentSrc.value = `assets/Action/${stage.value}/${folder}/${file}`
    playerKey.value++
    animBusy = true
    if (bubbleText) {
      bubble.value.text = bubbleText
      bubble.value.visible = true
      bubbleTimer = setTimeout(() => { bubble.value.visible = false }, Math.min(duration, 3000))
    }
    backTimer = setTimeout(() => backToStand(), duration)
  }

  // 当前阶段的 play 动画文件夹路径：Adult 走当前心情子目录，其余用阶段根目录下的 play
  function playFolderPath() {
    return stage.value.endsWith('/Adult')
      ? `assets/Action/${stage.value}/${mood.value}/play`
      : `assets/Action/${stage.value}/play`
  }

  // 随机播放当前阶段（及心情）play 文件夹下的一个 SWF，播完回 Stand。
  // 文件夹为空/缺失时不播放，直接回 Stand，避免自动循环中断。
  async function playRandomPlay() {
    if (sick.value) { backToStand(); return } // 生病：不播 play 动画
    syncMood()
    const folder = playFolderPath()
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch (_) {
      files = []
    }
    if (!files.length) { backToStand(); return }
    const file = files[Math.floor(Math.random() * files.length)]
    clearTimers()
    hideBubble()
    currentSrc.value = `${folder}/${file}`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => finishAction(false)
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 金币增减（以 localStorage 为基准，兼容商店窗口直接改键）
  function addCoins(n) {
    const cur = Number(localStorage.getItem('qqpet.coins')) || 0
    coins.value = Math.max(0, cur + (Number(n) || 0))
    localStorage.setItem('qqpet.coins', String(coins.value))
    window.api?.storageChanged?.() // 广播：商店/小游戏/背包窗口即时刷新
  }

  // —— 背包系统 ——
  // 背包存储于 localStorage 键 qqpet.inventory，结构 { [商品file]: { count, effect, value, name } }。
  // 商店购买 → 入背包；喂食/清洁/治疗动作 → 从背包消耗对应 effect 的物品。
  function inventoryGet() {
    try { return JSON.parse(localStorage.getItem('qqpet.inventory') || '{}') } catch (_) { return {} }
  }
  // 从背包消耗一件指定 effect 的物品；没有则返回 null（消耗成功返回该物品元数据）
  function consumeItem(effect) {
    const inv = inventoryGet()
    const key = Object.keys(inv).find((k) => inv[k] && inv[k].count > 0 && inv[k].effect === effect)
    if (!key) return null
    const item = inv[key]
    item.count--
    if (item.count <= 0) delete inv[key]
    localStorage.setItem('qqpet.inventory', JSON.stringify(inv))
    window.api?.storageChanged?.() // 广播：商店/背包窗口即时刷新
    return { file: key, name: item.name, effect: item.effect, value: item.value }
  }

  // —— 打工系统 ——
  // 打工为「按时长结算」的实时会话：打工中对饥饿/清洁额外消耗（每分钟各 -2），兑换为元宝（每分钟 2 元宝）。
  // 打工结束（到时长）时一次性结算已累计元宝；支持 1 小时标准班 + 5~15 分钟短班，结束后可马上再次打工。
  const WORK_RATE = 10 // 元宝/分钟；同时每分钟饥饿/清洁各 -2
  const WORK_EXP_RATE = 50 // 经验/分钟；打工同样长经验，到点与元宝一并结算
  const WORK_HINT_INTERVAL = 5 // 打工气泡提示间隔（分钟）；最后 1 分钟另有单独提醒
  const WORK_MIN_LEVEL = 5 // 打工等级门槛：4级以后（5级起，Kid 阶段）才能打工
  const working = ref(false) // 是否打工中
  const studying = ref(false) // 是否学习中（学习动画播放期间）
  const workLeftSec = ref(0) // 剩余秒数（供界面展示）
  let workStartAt = 0
  let workEndsAt = 0
  let workMinute = 0
  let workAccum = 0
  let workExpAccum = 0
  let workHintAt = 0 // 下一次打工气泡提示的分钟节点
  let workOneMinHinted = false // 最后 1 分钟提醒只弹一次

  // —— 托盘状态推送 ——
  // 组装当前状态（key + 文案）：死亡 > 打工(含剩余时间) > 学习 > 生病 > 休息 > 成长 。
  // key 用于主进程切换 Tray/性别/key 下的显卡图标，text 用于 tooltip。
  // 状态变化时才通过 IPC 推送，避免每帧刷写。
  let lastTraySig = ''
  function trayStatus() {
    if (dead.value) return { key: 'dead', text: 'QQ宠物 - 死亡' }
    if (working.value) {
      const m = Math.floor(workLeftSec.value / 60)
      const s = workLeftSec.value % 60
      return { key: 'work', text: `QQ宠物 - 打工中 剩余 ${m}:${String(s).padStart(2, '0')}` }
    }
    if (studying.value) return { key: 'study', text: 'QQ宠物 - 学习' }
    if (sick.value) return { key: 'ill', text: 'QQ宠物 - 生病' }
    if (hunger.value < 30) return { key: 'hungry', text: 'QQ宠物 - 饿了' }
    if (clean.value < 30) return { key: 'dirty', text: 'QQ宠物 - 很脏' }
    if (dockedEdge.value) return { key: 'pause', text: 'QQ宠物 - 休息' }
    return { key: 'normal', text: 'QQ宠物 - 成长' }
  }
  function pushTrayStatus() {
    if (!window.api?.setTrayStatus) return
    const t = trayStatus()
    const sig = t.key + t.text
    if (sig !== lastTraySig) {
      lastTraySig = sig
      window.api.setTrayStatus(t)
    }
  }

  function playWork(minutes = 60) {
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (level.value < WORK_MIN_LEVEL) { sayUntil(`要 ${WORK_MIN_LEVEL} 级以后才能打工哦～`, 2500); return }
    if (working.value) { sayUntil('已经在打工啦～', 2000); return }
    working.value = true
    workStartAt = Date.now()
    workEndsAt = Date.now() + minutes * 60000
    workMinute = 0
    workAccum = 0
    workExpAccum = 0
    workHintAt = WORK_HINT_INTERVAL
    workOneMinHinted = false
    workLeftSec.value = minutes * 60
    // 开始打工只弹气泡提示，不切换动画；打工期间自动状态循环照常进行
    sayUntil(`开始打工，${minutes} 分钟后领取 ${minutes * WORK_RATE} 元宝、${minutes * WORK_EXP_RATE} 经验～`, 2400)
  }

  // 学习：同上，播 play SWF 表现学习，播完加经验并气泡播报
  function playStudy() {
    playActivity('study')
  }

  // 打工/学习共用逻辑：播当前阶段(及心情)play 文件夹的一个 SWF。
  // visualOnly=true 时只播开工动画、不结算（打工由打工计时到点结算）。
  // play 文件夹为空/缺失时不播动画，直接走对应结算。
  async function playActivity(kind, visualOnly = false) {
    adoptingFirst = false // 领养动画被打工/学习打断后，退出恢复播放 Exit 动画
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (autoEnabled) { stopAuto(); autoResume = true }

    if (!visualOnly && kind === 'study') studying.value = true
    if (!visualOnly) sayUntil(kind === 'work' ? '开始打工赚钱～' : '开始学习啦～', 2000)

    syncMood()
    const folder = playFolderPath()
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch (_) {
      files = []
    }
    const settle = () => {
      if (kind === 'study') studying.value = false
      if (visualOnly) {
        backToStand()
        maybeResumeAuto()
      } else {
        reward(kind)
        backToStand()
        maybeResumeAuto()
      }
    }
    if (files.length) {
      const file = files[Math.floor(Math.random() * files.length)]
      clearTimers()
      hideBubble()
      currentSrc.value = `${folder}/${file}`
      playerKey.value++
      animBusy = true
      awaitingMeta = true
      onSwfDone = settle
      backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
    } else {
      // 无 play 素材：不切动画，直接结算
      clearTimers()
      settle()
    }
  }

  // 学习结算（打工结算由打工计时处理）
  function reward(kind) {
    addExp(30)
    sayUntil('学习完成，经验 +30！', 3000)
  }

  // 点击互动：随机播当前阶段（Adult 走心情）interact 文件夹下的 SWF，播完回 Stand。
  // 无素材/生病时不播，回退到闲聊气泡。
  async function playRandomInteract() {
    adoptingFirst = false // 领养动画被点击互动打断后，退出恢复播放 Exit 动画
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (autoEnabled) { stopAuto(); autoResume = true }
    syncMood()
    const folder = stage.value.endsWith('/Adult')
      ? `assets/Action/${stage.value}/${mood.value}/interact`
      : `assets/Action/${stage.value}/interact`
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch (_) {
      files = []
    }
    if (!files.length) { play('speak', { keepSwf: true, user: true }); return }
    const file = files[Math.floor(Math.random() * files.length)]
    clearTimers()
    hideBubble()
    currentSrc.value = `${folder}/${file}`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => finishAction(false)
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 内部自动循环：随机进入一个状态，作为"占位核心逻辑"（后续可替换为真实 QQ 事件源）
  function startAuto() {
    startStatTick() // 属性衰减始终运行（不受手动动作暂停自动闲聊影响）
    if (autoEnabled) return
    autoEnabled = true
    const loop = async () => {
      if (!autoEnabled) return
      // 正有一段动作动画在播放/排队：自动循环延后再试，绝不打断当前动画
      if (animBusy) {
        autoTimer = setTimeout(loop, 12000 + Math.random() * 14000)
        return
      }
      const n = Math.random()
      if (n < 0.3) {
        await playRandomPlay() // 一半概率随机播 play 动画
      } else {
        play('speak', { keepSwf: true })
      }
      autoTimer = setTimeout(loop, 12000 + Math.random() * 14000)
    }
    // 首播延迟，避免刚启动/刚结束手动动作时立刻插入一个状态
    autoTimer = setTimeout(loop, 6000 + Math.random() * 6000)
  }

  function stopAuto() {
    autoEnabled = false
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  }

  // 属性衰减循环：饥饿/清洁随时间下降；饥饿或清洁过低时健康也会缓慢下降。
  // 健康 ≤15 且当前空闲时播一次 Sick 动画提醒（60s 节流防刷屏）。
  let statTick = null
  let statSecond = 0
  let lastSickAt = -999
  let lastHungerHintAt = -999
  let lastCleanHintAt = -999
  function startStatTick() {
    if (statTick) return
    statTick = setInterval(() => {
      statSecond++
      const dt = statSecond
      let dirty = false
      if (dead.value) return // 死亡中：冻结属性衰减
      if (dt % DECAY.hunger === 0 && hunger.value > 0) { hunger.value--; dirty = true }   // 饱食度衰减
      if (dt % DECAY.clean === 0 && clean.value > 0) { clean.value--; dirty = true }      // 清洁度衰减
      if ((hunger.value < 20 || clean.value < 20) && dt % DECAY.health === 0 && health.value > 0) {
        health.value--; dirty = true                                                       // 长期饥饿/脏 → 健康下降
      }
      // 心情值衰减：饥饿或清洁降到"黄区"(30%)以下且未及时喂食/洗澡 → 心情掉得快（平均每分钟掉 15+）
      if ((hunger.value < 30 || clean.value < 30) && dt % DECAY.mood === 0 && moodVal.value > 0) {
        addMood(-1); dirty = true                                                          // 心情衰减
      }
      // 健康归零 → 死亡（保持 Die 形态，屏蔽其它动作）。死亡开关关闭时不死。
      if (DEATH_ENABLED && health.value <= 0 && !dead.value) {
        dirty = false
        goDie()
      }

      // 打工计时：每分钟消耗饥饿/清洁各 -2，累计元宝 +2；时长到点一次性结算。
      const idle = !backTimer && !awaitingMeta && !evolving
      if (working.value && !dead.value) {
        workLeftSec.value = Math.max(0, Math.floor((workEndsAt - Date.now()) / 1000))
        const el = Math.floor((Date.now() - workStartAt) / 60000)
        if (el > workMinute) {
          const delta = el - workMinute
          workMinute = el
          for (let i = 0; i < delta; i++) {
            if (hunger.value > 0) hunger.value = Math.max(0, hunger.value - 2)
            if (clean.value > 0) clean.value = Math.max(0, clean.value - 2)
            workAccum += WORK_RATE
            workExpAccum += WORK_EXP_RATE
          }
          dirty = true
        }
        // 打工气泡提示：每 WORK_HINT_INTERVAL 分钟报一次剩余时间，最后 1 分钟单独提醒。
        // 仅在空闲（无动画播放）时弹出，避免打断当前动画。
        if (idle) {
          if (el >= workHintAt && workLeftSec.value > 60) {
            sayUntil(`打工中，还剩 ${Math.ceil(workLeftSec.value / 60)} 分钟～`, 2500)
            workHintAt += WORK_HINT_INTERVAL
          } else if (workLeftSec.value > 0 && workLeftSec.value <= 60 && !workOneMinHinted) {
            workOneMinHinted = true
            sayUntil('马上要下班啦！', 2500)
          }
        }
        if (Date.now() >= workEndsAt) {
          working.value = false
          workLeftSec.value = 0
          const amt = workAccum
          const expAmt = workExpAccum
          workAccum = 0
          workExpAccum = 0
          addCoins(amt)
          addExp(expAmt) // 打工经验随元宝一并结算，享受心情成长加成
          sayUntil(`打工完成，获得 ${amt} 元宝、经验 +${expAmt}！`, 3200)
          backToStand()
          maybeResumeAuto()
          dirty = true
        }
      }

      // 空闲时的"提醒主人"动作（仅气泡提示；素材库无专用"饿/痒"SWF）。
      // 优先级：生病 > 饥饿 > 脏；各自节流避免刷屏。
      if (idle) {
        if (health.value <= SICK_AT && (dt - lastSickAt) >= 40) {       // 健康低于阈值 → 触发"生病"提醒动画
          lastSickAt = dt
          play('sick', { user: false })
          dirty = false
        } else if (hunger.value < 30 && (dt - lastHungerHintAt) >= 45) { // 饿了 → 提示喂食
          lastHungerHintAt = dt
          sayUntil('好饿呀，主人快喂喂我～', 3500)
        } else if (clean.value < 30 && (dt - lastCleanHintAt) >= 45) {   // 脏了 → 提示洗澡（挠痒）
          lastCleanHintAt = dt
          sayUntil('脏死了好痒，快帮我洗个澡吧～', 3500)
        }
      }
      if (dt >= 600) statSecond = 0
      if (dirty) persistLevel()
      pushTrayStatus() // 每秒刷新托盘状态文案（含死亡/打工剩余时间）
    }, 1000)
  }

  let dispatchBusy = false // 防重入锁：防止单次操作被重复触发/并发交错

  // 累计经验并处理升级/进化。opts.showLevUp=升级按钮触发时才额外播 LevUp 动画（交互累积升级不打断动作动画）
  async function addExp(n, opts = {}) {
    if (evolving || !n || n <= 0) return
    // 心情值加成成长经验：兴奋+30% / 高兴+10% / 平静+0%（原版 QQ 宠物）
    const mul = moodBand(moodVal.value).mul
    exp.value += Math.round(n * mul)
    let evolvedTo = null
    let leveledUp = false
    while (LEVEL_EXP[level.value - 1] && exp.value >= LEVEL_EXP[level.value - 1]) {
      exp.value -= LEVEL_EXP[level.value - 1]
      level.value++
      leveledUp = true
      const et = EVOLVE_AT(level.value)
      if (et) evolvedTo = et
    }
    persistLevel()
    if (evolvedTo) {
      triggerEvolution(evolvedTo)
    } else if (opts.showLevUp && leveledUp) {
      play('levup', { user: true })
    }
  }

  // 进化流程：在当前阶段播升级动画（LevUp），播完切入目标阶段并回 Stand。
  // 注意：破壳动画（Appear）仅用于"刚获取宠物"的出生场景，不用于升级/进化。
  function triggerEvolution(target) {
    if (evolving) return
    evolving = true
    stopAuto()
    clearTimers()
    hideBubble()
    currentSrc.value = `assets/Action/${stage.value}/LevUp.swf`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = async () => {
      evolving = false
      stage.value = target
      persistLevel()
      backToStand()
      const text = await randomBubble('LevUp')
      if (text) sayUntil(text, 3000)
      maybeResumeAuto()
    }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 领养宠物：首次登录选定性别并命名后，播放对应性别蛋期的「领养」First 动画（出生动画），
  // 播完自动回 Stand 并开始自动循环。此后性别/昵称长期持久化。
  function adopt(genderVal, nameVal) {
    if (dead.value) return
    GENDER = genderVal === 'MM' ? 'MM' : 'GG'
    // 重置为一只全新的蛋（1 级）
    level.value = 1
    exp.value = 0
    hunger.value = 100
    clean.value = 100
    health.value = 100
    moodVal.value = 1000
    coins.value = 0
    dead.value = false
    stage.value = stageFromLevel(1) // <GENDER>/Egg
    petName.value = nameVal || ''
    adopted.value = true
    persistLevel()
    localStorage.setItem('qqpet.gender', GENDER)
    localStorage.setItem('qqpet.name', petName.value)
    localStorage.setItem('qqpet.adopted', '1')
    window.api?.setTrayGender?.(GENDER) // 同步托盘图标性别目录
    window.api?.showPet?.() // 显示宠物窗，领养窗随主进程关闭——两者不同时出现
    stopAuto()
    clearTimers()
    hideBubble()
    currentSrc.value = statePath(stage.value, 'First.swf')
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    adoptingFirst = true // 领养动画播放中
    onSwfDone = () => { adoptingFirst = false; backToStand(); startAuto() }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 实际执行单个动作（此刻已空闲，可直接切换/播放动画）
  function runDispatch(action, height) {
    dispatchBusy = true
    setTimeout(() => { dispatchBusy = false }, 400)

    // 开窗类动作不受死亡门禁 / 播完才切约束：商店/小游戏/背包/宠物信息任何状态都可打开。玩小游戏 +50 心情
    if (action === 'game') { addMood(50); window.api.openGame?.(); return }
    if (action === 'shop') { window.api.openShop?.(); return }
    if (action === 'bag') { window.api.openBag?.(); return }
    if (action === 'info') { window.api.openInfo?.(); return }

    if (action && action.type === 'custom') {
      // 直接播放任意 SWF 路径（右键"选择 SWF 播放…"）——用户操作，暂停自动循环
      if (autoEnabled) stopAuto()
      clearTimers()
      currentSrc.value = action.path
      playerKey.value++
      return
    }
    // 死亡态：仅允许"复活/退出/进场(重播死亡形态)"，其余动作一律忽略
    if (dead.value) {
      if (action === 'revival') goRevive()
      else if (action === 'exit') window.api.appQuit?.() // 死亡时退出：直接退出，不播 Exit 动画
      else if (action === 'enter') goDie()
      return
    }
    if (action && action.type === 'adopt') { adopt(action.gender, action.name); return }
    // 背包消耗类动作：喂食/清洁/治疗（支持 'eat' 字符串与 {type:'eat'} 对象两种形式）。
    // 背包里没有对应物品时提示并忽略——不播放动画、不加属性。
    const consumeEffect =
      action === 'eat' || action === 'clean' || action === 'cure' ? action
      : (action && typeof action === 'object' && (action.type === 'eat' || action.type === 'clean' || action.type === 'cure')) ? action.type
      : null
    if (consumeEffect) {
      const item = consumeItem(consumeEffect)
      if (!item) {
        sayUntil(
          consumeEffect === 'eat' ? '背包里没有食物，先去商店买点吃的吧！'
            : consumeEffect === 'clean' ? '背包里没有清洁用品，先去商店买点吧！'
            : '背包里没有药品，先去商店买点吧！', 3000)
        return
      }
      play(consumeEffect, { user: true })
      const v = Number(item.value) || (consumeEffect === 'cure' ? 30 : 25)
      if (consumeEffect === 'eat') { hunger.value = Math.min(100, hunger.value + v); addMood(20); addExp(8) }
      else if (consumeEffect === 'clean') { clean.value = Math.min(100, clean.value + v); addMood(20); addExp(5) }
      else if (consumeEffect === 'cure') { health.value = Math.min(100, health.value + v); addExp(6) }
      persistLevel()
      sayUntil(`使用了${item.name}，${consumeEffect === 'eat' ? '饱食' : consumeEffect === 'clean' ? '清洁' : '健康'} +${v}！`, 2600)
      return
    }
    else if (action === 'sick') {  play(action, { user: true }); addExp(4) }
    else if (action === 'speak') { play('speak', { keepSwf: true, user: true }); addExp(2) }
    else if (action === 'enter') { play('enter', {}) }       // 进场：启动时播 Enter 后回 Stand
    else if (action === 'exit') { if (adoptingFirst) window.api.appQuit?.(); else playExitSwf() } // 刚领养直接退出；平时播 Exit 后退出
    else if (action === 'hide') { playHide(null) }           // 隐藏：播 Hide 后隐藏
    else if (action === 'hide-left') { playHide('left', height) }    // 隐藏到屏幕左侧
    else if (action === 'hide-right') { playHide('right', height) }  // 隐藏到屏幕右侧
    else if (action === 'stat') {  sayStatus() }
    else if (action === 'levup') { addExp(999, { showLevUp: true }) } // 升级按钮：一次加足量经验（兼作测试入口）
    else if (action === 'work' || action === 'work1h') { playWork(60) } // 打工1小时：每分钟 2 元宝，饥饿/清洁各-2
    else if (action === 'work15m') { playWork(3)  }                  // 打工15分钟（短班）
    else if (action === 'study') { playStudy() }                  // 学习：帧动画 + 计时加经验
    else if (action === 'interact') { playRandomInteract(); addMood(moodClickGain(moodVal.value)) }      // 点击互动：随机播 interact 动画 + 按档位加心情
    else if (action === 'stand') { backToStand() }
  }

  // 对外统一动作入口（App 点击/右键/外部逻辑调用）：
  // - 气泡 & 开窗类立即执行；
  // - 其余动作，若当前正有一段动画在播（animBusy）则忽略掉，避免打断当前动画；
  //   动画播完回到空闲后新动作自然可正常执行。
  function dispatch(action, height) {
    if (action && action.type === 'bubble') {
      sayUntil(action.text || '', 3000)
      return
    }
    // 查看状态：仅气泡播报、不播放动画，无需等待当前动画播完，随时可立即查看
    if (action === 'stat') { runDispatch(action, height); return }
    // 刚领养（First 动画播放中）点退出：不等待动画，直接退出
    if (action === 'exit' && adoptingFirst) { runDispatch(action, height); return }
    // 托盘高频指令：隐藏（原地/左/右）与显示宠物优先级最高，立即打断当前动画执行；
    // 退出同样可打断（含正在播放的隐藏动画），避免退出被 animBusy 吞掉
    if (action === 'hide-left' || action === 'hide-right' || action === 'hide' || action === 'enter' || action === 'exit') { runDispatch(action, height); return }
    // 开窗类不排队：随时可打开
    if (action === 'shop' || action === 'game' || action === 'bag' || action === 'info') { runDispatch(action, height); return }
    // 死亡态：复活/退出/进场不受 animBusy 门禁（死亡画面 animBusy 恒为 true，否则复活/退出会被吞掉）
    if (dead.value) {
      if (action === 'revival' || action === 'exit' || action === 'enter') { runDispatch(action, height); return }
      return
    }
    if (evolving || dispatchBusy) return
    if (animBusy) return // 动画播放中：直接忽略新动作，不排队也不等待
    runDispatch(action, height)
  }

  return {
    currentSrc,
    playerKey,
    bubble,
    stage,
    level,
    exp,
    hunger,
    clean,
    health,
    mood,
    moodVal,
    working,
    studying,
    workLeftSec,
    dead,
    dockedEdge, undock,
    coins,
    adopted,
    petName,
    play,
    backToStand,
    applyRealDuration,
    sayUntil,
    sayStatus,
    playCustom,
    addExp,
    addCoins,
    dispatch,
    startAuto,
    stopAuto
  }
}