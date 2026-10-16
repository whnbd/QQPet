import { app, shell, BrowserWindow, ipcMain, dialog, Menu, screen, Tray, nativeImage } from 'electron'
import { join, normalize, isAbsolute } from 'path'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import zlib from 'zlib'
import { TextDecoder } from 'util'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/assets/penguin.ico?asset'

let mainWindow = null
let loginWindow = null
let dragTimer = null
let tray = null
let trayTopItem = null // 托盘"宠物置顶"勾选项引用（与右键菜单联动刷新勾选态）
let trayThroughItem = null // 托盘"鼠标穿透"勾选项引用
let centerWindow = null // 商店/小游戏/宠物信息/背包 四合一中心窗口（独立）
let menuWindow = null // 宠物右键菜单窗口（QQ宠物风格，独立）
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'WindowsDocking')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 160,
    height: 180,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 宠物窗口不出现在任务栏，仅通过托盘管理
    frame: false,
    transparent: true,
    show: false, // 先不显示：由渲染层自行决定何时显示（已领养启动/领养完成后），避免与领养窗同时出现
    icon, // 任务栏/窗口图标统一用 penguin.ico
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false // 关闭拼写检查，减少渲染进程内存占用
    }
  })

  // 锁死窗口最小/最大尺寸：任何操作（含 Aero Snap）都无法把窗口拉大
  mainWindow.setMinimumSize(160, 180)
  mainWindow.setMaximumSize(160, 180)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 禁用 Chromium 默认右键菜单（查看/检查元素等），自定义菜单由渲染层经 IPC 主动触发
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // 等主窗口创建好（页面加载完成）后才创建托盘图标，避免 tray 抢先于 mainWindow 就绪
  mainWindow.webContents.once('did-finish-load', () => {
    if (!tray) {
      // 恢复持久化的窗口偏好（置顶/穿透），再创建托盘
      windowPrefs = loadWindowPrefs()
      mainWindow.setAlwaysOnTop(windowPrefs.alwaysOnTop)
      mainWindow.setIgnoreMouseEvents(windowPrefs.mouseThrough, { forward: true })
      createTray()
    }
  })

 
}

// 创建中心窗口（商店/小游戏/宠物信息三合一，顶部标签栏切换；tab = 'shop'|'game'|'info'）
function createCenterWindow(tab) {
  if (centerWindow && !centerWindow.isDestroyed()) { centerWindow.focus(); return }
  centerWindow = new BrowserWindow({
    width: 700,
    height: 520,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false // 关闭拼写检查，减少渲染进程内存占用
    }
  })
  centerWindow.on('closed', () => { centerWindow = null })
  const url = `center.html?tab=${encodeURIComponent(tab || 'shop')}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    centerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${url}`)
  } else {
    centerWindow.loadFile(join(__dirname, '../renderer/center.html'), { query: { tab: tab || 'shop' } })
  }
}

// 解析 SWF 文件头，计算总播放时长（毫秒）。
// SWF 头：签名(3) + 版本(1) + 文件长(4) + RECT + frameRate(UI16,8.8定点) + frameCount(UI16)。
// FWS 直接解析；CWS(zlib) 需解压后再读 RECT；ZWS(LZMA) 无内置解压，返回 null。
// 解析失败返回 null，由调用方回退写死时长。
function getSwfDuration(buf) {
  try {
    const len = buf.length
    if (len < 8) return null
    const sig = buf.slice(0, 3).toString('latin1')
    let view = buf
    let base = 8 // RECT 从第 8 字节开始
    if (sig === 'CWS') {
      view = zlib.inflateSync(buf.subarray(8))
      base = 0
    } else if (sig !== 'FWS') {
      return null // 含 ZWS（LZMA 压缩），无法用内置解压
    }
    if (view.length < 12) return null

    // 位级读取（big-endian bit order）
    const readBits = (byteOffset, bitOffset, count) => {
      let value = 0
      for (let i = 0; i < count; i++) {
        const bi = bitOffset + i
        const byte = view[byteOffset + (bi >> 3)]
        value = (value << 1) | ((byte >> (7 - (bi & 7))) & 1)
      }
      return value
    }

    // 跳过 RECT：先读 5 位 Nbits，再读 4 个坐标各 Nbits，然后按字节对齐
    const nbits = readBits(base, 0, 5)
    const rectBits = 5 + nbits * 4
    const alignedBytes = (rectBits + 7) >> 3 // ceil(rectBits/8)，对齐到字节
    const frOffset = base + alignedBytes // frameRate 起始字节（字节对齐）
    if (frOffset + 4 > view.length) return null

    // frameRate：UI16 little-endian，8.8 定点，高字节为整数部分
    const frameRate = view[frOffset + 1] + view[frOffset] / 256

    // frameCount：UI16 little-endian
    const frameCount = view[frOffset + 2] + view[frOffset + 3] * 256

    if (!frameRate || !frameCount) return null
    return Math.round((frameCount / frameRate) * 1000)
  } catch (_) {
    return null
  }
}

// IPC：读取资源 SWF 文件，返回 { data:ArrayBuffer, durationMs:number|null }
// （支持 resources 相对路径或任意绝对路径；durationMs 由文件头解析真实时长）
ipcMain.handle('read-swf', (_event, pathOrRel) => {
  const filePath = isAbsolute(pathOrRel)
    ? pathOrRel
    : join(app.getAppPath(), 'resources', normalize(pathOrRel).replace(/^(\.\.[/\\])+/, ''))
  const buf = readFileSync(filePath)
  return {
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    durationMs: getSwfDuration(buf)
  }
})

// IPC：弹出文件选择对话框选择 SWF
ipcMain.handle('pick-swf', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择 SWF 文件',
    properties: ['openFile'],
    filters: [{ name: 'Flash 动画', extensions: ['swf'] }]
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// 把相对路径安全地拼到 resources 下
function resourcePath(rel) {
  return join(app.getAppPath(), 'resources', normalize(rel).replace(/^(\.\.[/\\])+/, ''))
}

// IPC：读取 Communication 下的文案 txt（GBK 编码 → 返回 UTF-8 字符串），参数形如 'Eat/1.txt'
ipcMain.handle('read-txt', (_e, rel) => {
  const buf = readFileSync(resourcePath(join('assets', 'Communication', rel)))
  return new TextDecoder('gbk').decode(buf).trim()
})

// IPC：读取 resources/assets 下的图片，返回 dataURL（供登录/商店等 UI 使用）。
// 按扩展名识别 MIME：png / gif / svg。
ipcMain.handle('read-image', (_e, rel) => {
  const buf = readFileSync(resourcePath(String(rel)))
  const ext = String(rel).split('.').pop().toLowerCase()
  const mime = ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
})

// IPC：列出 Communication 某类别下的全部 .txt 文件名（如 'SmallTalk' → ['1.txt','2.txt',...]）
ipcMain.handle('list-txt', (_e, category) => {
  const dir = resourcePath(join('assets', 'Communication', String(category)))
  return readdirSync(dir).filter((f) => f.endsWith('.txt'))
})

// IPC：列出 Action 某子目录下的全部 .swf 文件名（如 'GG/Egg/play'）
ipcMain.handle('list-swf', (_e, folder) => {
  const dir = resourcePath(join('assets', 'Action', String(folder)))
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.swf'))
})

// IPC：读取 resources/assets 下的 SVG 文件，返回 data:image/svg+xml;base64 dataURL（供商店商品图标等）
ipcMain.handle('read-svg', (_e, rel) => {
  const buf = readFileSync(resourcePath(String(rel)))
  return `data:image/svg+xml;base64,${buf.toString('base64')}`
})

// IPC：通用文件列表——列出 assets 下任意子目录的文件名，可选扩展名过滤（如 list-files('game','swf')）
ipcMain.handle('list-files', (_e, rel, ext) => {
  const dir = resourcePath(join('assets', String(rel)))
  let files = []
  try {
    files = readdirSync(dir)
  } catch (_) {
    return []
  }
  if (ext) files = files.filter((f) => f.toLowerCase().endsWith(`.${String(ext).toLowerCase()}`))
  return files.sort()
})

// IPC：控制栏点击 → 转发给宠物窗口渲染层 dispatch
ipcMain.on('control-action', (_e, action) => {
  mainWindow?.webContents.send('pet-action', action)
})

// IPC：商店等窗口发来的反馈气泡 → 宠物窗口气泡播报（不切动画）
ipcMain.on('pet-bubble', (_e, text) => {
  mainWindow?.webContents.send('pet-action', { type: 'bubble', text: String(text || '') })
})

// IPC：打开中心窗口（tab 决定初始页：shop 商店 / game 小游戏 / info 宠物信息）
ipcMain.on('open-shop', () => createCenterWindow('shop'))
ipcMain.on('open-game', () => createCenterWindow('game'))
ipcMain.on('open-info', () => createCenterWindow('info'))
ipcMain.on('open-bag', () => createCenterWindow('bag'))
// 元宝/背包数据变更：广播给所有数据展示窗口，替代跨窗口轮询
ipcMain.on('storage-changed', () => {
  const wins = [mainWindow, centerWindow].filter(Boolean)
  for (const w of wins) w.webContents.send('storage-changed')
})

// 首次领养选择窗口（选性别 + 命名）
let petSelectWindow = null
function createPetSelectWindow() {
  if (petSelectWindow && !petSelectWindow.isDestroyed()) { petSelectWindow.focus(); return }
  petSelectWindow = new BrowserWindow({
    width: 480,
    height: 430,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false // 关闭拼写检查，减少渲染进程内存占用
    }
  })
  petSelectWindow.center()
  petSelectWindow.on('closed', () => { petSelectWindow = null })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    petSelectWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/petselect.html`)
  } else {
    petSelectWindow.loadFile(join(__dirname, '../renderer/petselect.html'))
  }
}
ipcMain.on('open-pet-select', () => createPetSelectWindow())

// 领养完成：把 {gender, name} 转发给宠物窗口播 First 出生动画，并关闭选择窗
ipcMain.on('adopt-pet', (_e, payload) => {
  mainWindow?.webContents.send('pet-action', { type: 'adopt', gender: payload?.gender, name: payload?.name })
  petSelectWindow?.close()
})

// IPC：渲染层自关闭当前窗口（商店/游戏窗的关闭按钮）
ipcMain.on('close-self', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})

// IPC：渲染层右键时打开 QQ宠物风格菜单窗口（独立于原生菜单）
ipcMain.on('show-context-menu', () => {
  createMenuWindow()
})

// IPC：菜单窗口点击某项 → 置顶/穿透在主进程直接切换（不转发渲染层、菜单保持打开）；
// 其余动作转发给宠物窗口播放，并关闭菜单
ipcMain.on('context-menu-action', (_e, action) => {
  if (action === 'toggle-always-on-top') {
    applyAlwaysOnTop(!windowPrefs.alwaysOnTop)
  } else if (action === 'toggle-mouse-through') {
    applyMouseThrough(!windowPrefs.mouseThrough)
  } else {
    mainWindow?.webContents.send('pet-action', action)
    menuWindow?.close()
  }
})

// IPC：渲染层播完 Hide 动画后隐藏窗口
ipcMain.on('hide-pet', () => {
  mainWindow?.hide()
})

// IPC：显示宠物窗口（领养完成等场景重新露出）
ipcMain.on('show-pet', () => {
  mainWindow?.show()
})

// IPC：渲染层推送当前状态 → 切换托盘图标 + 更新 tooltip。
// status = { key, text }；key 对应 Tray/<性别>/<key>/1.ico 子目录：normal/work/study/pause/dead/ill。
// 图标仅在 key 变化时切换（避免每帧重读文件），tooltip 每次更新（打工剩余时间倒计时）。
let TRAY_GENDER = 'Boy' // GG=公宠→Boy / MM=母宠→Girl；渲染层领养后通过 set-tray-gender 通知切换
const TRAY_MAP = { normal: 'normal', work: 'work', study: 'study', pause: 'pause', dead: 'dead', ill: 'ill', hungry: 'hungry', dirty: 'dirty' }
let lastTrayIcon = ''

// 渲染层上报宠物性别（GG/MM），据此切换托盘图标的性别目录；若已有图标在显示则立即重刷
ipcMain.on('set-tray-gender', (_e, gender) => {
  const next = gender === 'MM' ? 'Girl' : 'Boy'
  if (next === TRAY_GENDER) return
  TRAY_GENDER = next
  if (tray && lastTrayIcon) {
    try {
      tray.setImage(nativeImage.createFromPath(resourcePath(join('assets', 'img_res', 'Tray', TRAY_GENDER, lastTrayIcon, '1.ico'))))
    } catch (_) { /* 图标缺失时保持当前 */ }
  }
})

ipcMain.on('set-tray-tooltip', (_e, status) => {
  const key = TRAY_MAP[status?.key && status.key] || 'normal'
  const text = String((status && status.text) || 'QQ宠物')
  if (key !== lastTrayIcon && tray) {
    lastTrayIcon = key
    try {
      const ico = resourcePath(join('assets', 'img_res', 'Tray', TRAY_GENDER, key, '1.ico'))
      tray.setImage(nativeImage.createFromPath(ico))
    } catch (_) { /* 图标缺失时保持当前 */ }
  }
  tray?.setToolTip(text)
})

// IPC：把宠物窗口移到屏幕左/右边缘。height 可选：拖动贴边时使用鼠标当前高度，
// 托盘菜单触发（未传 height）时高度在工作区内随机
ipcMain.on('hide-to-edge', (_e, edge, height) => {
  if (!mainWindow) return
  const dis = screen.getPrimaryDisplay().workArea
  const maxY = Math.max(dis.y, dis.y + dis.height - 180)
  let y
  if (typeof height === 'number' && Number.isFinite(height)) {
    y = Math.min(Math.max(height, dis.y), maxY)
  } else {
    y = dis.y + Math.floor(Math.random() * (maxY - dis.y + 1))
  }
  if (edge === 'left') {
    mainWindow.setBounds({ x: dis.x, y, width: 160, height: 180 })
  } else if (edge === 'right') {
    mainWindow.setBounds({ x: dis.x + dis.width - 160, y, width: 160, height: 180 })
  }
})

// 创建 QQ宠物风格右键菜单窗口（透明无边框、置顶、出现在鼠标附近）。
// 原版 QQ 宠物菜单是半透明圆角渐变面板，原生菜单无法还原这种风格，故用 HTML/CSS 独立窗口实现。
function createMenuWindow() {
  if (menuWindow && !menuWindow.isDestroyed()) { menuWindow.focus(); return }

  const W = 154
  const H = 590
  const pos = screen.getCursorScreenPoint()
  const dis = screen.getDisplayNearestPoint(pos).workArea
  // 菜单位置：默认在鼠标右下方，超出屏幕时收回到工作区内
  let x = pos.x + 4
  let y = pos.y - 8
  if (x + W > dis.x + dis.width) x = dis.x + dis.width - W
  if (x < dis.x) x = dis.x
  if (y + H > dis.y + dis.height) y = dis.y + dis.height - H
  if (y < dis.y) y = dis.y

  menuWindow = new BrowserWindow({
    x,
    y,
    width: W,
    height: H,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true, // 菜单不出现在任务栏
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false // 关闭拼写检查，减少渲染进程内存占用
    }
  })
  menuWindow.on('closed', () => { menuWindow = null })
  // 点击菜单外部/失焦即关闭。延迟并复查焦点，避免创建瞬间的过渡失焦误关。
  menuWindow.on('show', () => {
    menuWindow?.focus()
  })
  menuWindow.on('blur', () => {
    setTimeout(() => {
      if (menuWindow && !menuWindow.isDestroyed() && !menuWindow.isFocused() && !menuWindow.webContents.isFocused()) {
        menuWindow.close()
      }
    }, 120)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    menuWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/menu.html`)
  } else {
    menuWindow.loadFile(join(__dirname, '../renderer/menu.html'))
  }
}

// —— 窗口偏好持久化（宠物置顶 / 鼠标穿透）——
// 存到 userData 下的 JSON 文件，重启后恢复：置顶/穿透是主进程窗口属性，无法用 localStorage 持久化
const PREFS_FILE = 'qqpet-window-prefs.json'
let windowPrefs = { alwaysOnTop: false, mouseThrough: false }
function loadWindowPrefs() {
  try {
    const raw = readFileSync(join(app.getPath('userData'), PREFS_FILE), 'utf-8')
    const p = JSON.parse(raw)
    return { alwaysOnTop: !!p.alwaysOnTop, mouseThrough: !!p.mouseThrough }
  } catch (_) {
    return { alwaysOnTop: false, mouseThrough: false }
  }
}
function saveWindowPrefs(partial) {
  windowPrefs = { ...windowPrefs, ...partial }
  try { writeFileSync(join(app.getPath('userData'), PREFS_FILE), JSON.stringify(windowPrefs), 'utf-8') } catch (_) {}
}

// 刷新托盘菜单两个勾选项（右键菜单/托盘切换后保持勾选态一致）
function syncTrayMenuChecks() {
  if (trayTopItem) trayTopItem.checked = windowPrefs.alwaysOnTop
  if (trayThroughItem) trayThroughItem.checked = windowPrefs.mouseThrough
}

// 置顶/穿透统一入口：持久化 → 应用窗口属性 → 联动托盘菜单勾选 → 通知右键菜单刷新
function applyAlwaysOnTop(on) {
  saveWindowPrefs({ alwaysOnTop: on })
  mainWindow?.setAlwaysOnTop(on)
  syncTrayMenuChecks()
  menuWindow?.webContents.send('window-prefs-changed', { ...windowPrefs })
}
function applyMouseThrough(on) {
  saveWindowPrefs({ mouseThrough: on })
  mainWindow?.setIgnoreMouseEvents(on, { forward: true })
  syncTrayMenuChecks()
  menuWindow?.webContents.send('window-prefs-changed', { ...windowPrefs })
}

// IPC：右键菜单窗口读取当前置顶/穿透状态（渲染勾选标记用）
ipcMain.handle('get-window-prefs', () => ({ ...windowPrefs }))

// 创建系统托盘：隐藏/显示宠物、退出；左键单击切换显示与隐藏
function createTray() {
  tray = new Tray(icon)
  tray.setToolTip('QQ宠物')
  const menu = Menu.buildFromTemplate([
    {
      label: '显示宠物',
      // 普通隐藏后点击：先显示窗口，再播放对应阶段的 Enter 进场动画（播完自动回 Stand）
      click: () => showPet()
    },
    {
      label: '隐藏宠物',
      click: () => mainWindow?.webContents.send('pet-action', 'hide')
    },
    // {
    //   label: '隐藏到屏幕左侧',
    //   click: () => mainWindow?.webContents.send('pet-action', 'hide-left')
    // },
    // {
    //   label: '隐藏到屏幕右侧',
    //   click: () => mainWindow?.webContents.send('pet-action', 'hide-right')
    // },
    // { type: 'separator' },
    // {
    //   label: '商店',
    //   click: () => mainWindow?.webContents.send('pet-action', 'shop')
    // },
    // { type: 'separator' },
    {
      label: '宠物置顶',
      type: 'checkbox',
      checked: windowPrefs.alwaysOnTop,
      click: (menuItem) => applyAlwaysOnTop(menuItem.checked)
    },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: windowPrefs.mouseThrough,
      // 开启后窗口不拦截鼠标交互（点击穿透到下方程序）；保留 forward 让动画区域仍能收到鼠标移动
      click: (menuItem) => applyMouseThrough(menuItem.checked)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => mainWindow?.webContents.send('pet-action', 'exit') // 播放 Exit 离场动画后退出
    }
  ])
  // 保存两个勾选项引用：右键菜单切换后同步刷新托盘勾选态
  trayTopItem = menu.items.find((i) => i.label === '宠物置顶')
  trayThroughItem = menu.items.find((i) => i.label === '鼠标穿透')
  // Windows 上不能用 setContextMenu：一旦设置左键单击就会被菜单接管、click 事件不再触发。
  // 改为：setContextMenu 不设，左键点击 toggle 显示/隐藏，右键时才手动弹出菜单。
  tray.on('click', () => {
    // if (!mainWindow) return
    // if (mainWindow.isVisible()) {
    //   // 宠物可见 → 隐藏（控制栏同步隐藏）
    //   mainWindow.hide()
    //   controlBar?.hide()
    // } else {
      // 宠物隐藏 → 显示并播放进场动画（控制栏跟随显示并重新定位）
      focusPet()
    // }
  })
  tray.on('right-click', () => tray.popUpContextMenu(menu))
}

// 显示宠物并重播当前阶段进场动画（隐藏后恢复 / 托盘左键统一入口）
function showPet() {
  if (!mainWindow) return
  if(mainWindow.isVisible()) return
  mainWindow.show()
  mainWindow.webContents.send('pet-action', 'enter')
}
function focusPet() {
  if (!mainWindow) return
  mainWindow.focus()
  // mainWindow.webContents.send('pet-action', 'enter')
}

// 创建登录窗口（340×242，透明无边框）；登录成功后销毁并弹出宠物窗口
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 340,
    height: 242,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    icon, // 任务栏图标用 penguin.ico
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: false // 关闭拼写检查，减少渲染进程内存占用
    }
  })
  loginWindow.center()
  loginWindow.on('closed', () => { loginWindow = null })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    loginWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/login.html`)
  } else {
    loginWindow.loadFile(join(__dirname, '../renderer/login.html'))
  }
}

// 登录成功：先创建宠物窗口（其内置会创建托盘），再关闭登录窗。
// 顺序必须如此：若先销毁登录窗，瞬间无窗口会触发 window-all-closed → 应用退出。
ipcMain.on('login-success', () => {
  createWindow()
  loginWindow?.destroy()
  loginWindow = null
})

// 取消/关闭登录：退出应用
ipcMain.on('login-cancel', () => app.quit())

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('app-quit', () => app.quit())

  // IPC：JS 手动拖动窗口（左键按住移动窗口，鼠标移出窗口也不中断）
  ipcMain.on('window-drag-start', () => {
    stopWindowDrag()
    // 记录是否从屏幕左/右边缘被拖出：拖动前窗口贴合边缘视为"贴边隐藏(dock)"，
    // 一旦被拖离边缘超过阈值，通知渲染层回 Stand。非 dock 的普通拖动不受影响。
    const [wx] = mainWindow.getPosition()
    const dockArea = screen.getPrimaryDisplay().workArea
    let dockEdge = null
    if (Math.abs(wx - dockArea.x) < 10) dockEdge = 'left'
    else if (Math.abs(wx - (dockArea.x + dockArea.width - 160)) < 10) dockEdge = 'right'
    let standSent = false
    // 自动贴边开关：从 dock 贴边状态开始拖动时禁用本次自动贴边（否则一移动又吸回边缘）；
    // 拖离超过阈值回 Stand 后重新启用，此时拖回边缘可再次贴边。
    let snapEnabled = !dockEdge
    const cursor = screen.getCursorScreenPoint() // 物理像素
    const factor = screen.getPrimaryDisplay().scaleFactor // DPI 缩放
    const [winX, winY] = mainWindow.getPosition() // 逻辑像素(DIP)
    let lastX = cursor.x
    let lastY = cursor.y
    let idleCount = 0
    dragTimer = setInterval(() => {
      const cur = screen.getCursorScreenPoint()
      // 光标未移动：跳过 setBounds，避免透明窗口无谓重绘造成的卡顿
      if (cur.x === lastX && cur.y === lastY) {
        idleCount++
        // 连续 ~120ms 未移动视为松手，自动停止
        if (idleCount >= 15) {
          stopWindowDrag()
        }
        return
      }
      idleCount = 0
      lastX = cur.x
      lastY = cur.y
      // 物理像素 → 逻辑像素换算，避免 DPI 缩放下窗口跑偏
      const nx = winX + Math.round((cur.x - cursor.x) / factor)
      const ny = winY + Math.round((cur.y - cursor.y) / factor)
      // 仅位置变化时 setBounds（控件尺寸），防止 Windows 隐形 resize 边框把窗口拉大
      mainWindow.setBounds({ x: nx, y: ny, width: 160, height: 180 })

      // 拖动到屏幕左/右边缘：自动切换为贴边隐藏（对应托盘"隐藏到屏幕左/右侧"）。
      // 把当前鼠标高度传给渲染层，贴边时窗口与鼠标同高。
      if (snapEnabled && nx <= dockArea.x + 5) {
        stopWindowDrag()
        mainWindow.webContents.send('pet-action', 'hide-left', ny)
        return
      }
      if (snapEnabled && nx >= dockArea.x + dockArea.width - 100 - 5) {
        stopWindowDrag()
        mainWindow.webContents.send('pet-action', 'hide-right', ny)
        return
      }

      // 贴边隐藏(dock)被拖离：离开对应边缘超过 60px 即视为"拖离"，回 Stand（只发一次）
      if (dockEdge && !standSent) {
        let escaped = false
        if (dockEdge === 'left' && nx - dockArea.x > 60) escaped = true
        if (dockEdge === 'right' && nx < dockArea.x + dockArea.width - 160 - 60) escaped = true
        if (escaped) {
          standSent = true
          snapEnabled = true // 已明确拖离 dock，此后拖回边缘可再次自动贴边
          mainWindow.webContents.send('pet-action', 'stand')
        }
      }
    }, 1)
  })

  function stopWindowDrag() {
    if (dragTimer) {
      clearInterval(dragTimer)
      dragTimer = null
    }
  }
  ipcMain.on('window-drag-end', stopWindowDrag)

  createLoginWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
