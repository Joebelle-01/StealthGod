const { app, BrowserWindow, screen, globalShortcut, ipcMain, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const WebSocket = require('ws')
const fs = require('fs')
const crypto = require('crypto')

// Prevent GPU crash on transparent windows with hybrid GPU setups (NVIDIA + AMD)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

const ai = require('./ai')


// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {}
  return {
    apiKey: '',
    groqApiKey: '',
    candidateName: '',
    resumeContext: '',
    jobDescription: '',
    userContext: '',
    overlayHeight: 110,
    opacity: 0.88,
    fontSize: 14,
    silenceTimeout: 2.2,
    autoClearDelay: 0
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

let config = loadConfig()

// ─── Windows ────────────────────────────────────────────────────────────────
let overlayWin = null
let settingsWin = null

function calculateOverlayBounds() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const h = config.overlayHeight || 115
  const pos = config.overlayPosition || 'top-center'
  const widthMode = config.overlayWidth || 'compact'

  // Calculate width
  let w = screenWidth
  if (widthMode === 'compact') {
    w = Math.min(640, screenWidth - 40)
  } else if (widthMode === 'medium') {
    w = Math.min(840, screenWidth - 40)
  } else if (widthMode === 'wide') {
    w = Math.min(1080, screenWidth - 40)
  }

  // Calculate X (centered or full)
  let x = primaryDisplay.workArea.x
  if (w < screenWidth) {
    x = primaryDisplay.workArea.x + Math.round((screenWidth - w) / 2)
  }

  // Calculate Y
  let y = primaryDisplay.workArea.y
  if (pos === 'top' || pos === 'top-center') {
    y = primaryDisplay.workArea.y
  } else if (pos === 'center') {
    y = primaryDisplay.workArea.y + Math.round((screenHeight - h) / 2)
  } else if (pos === 'bottom') {
    y = primaryDisplay.workArea.y + screenHeight - h
  }

  return { x, y, width: w, height: h }
}

function createOverlay() {
  const bounds = calculateOverlayBounds()

  overlayWin = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Prevent unexpected window creation and navigation
  overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  overlayWin.webContents.on('will-navigate', (e) => e.preventDefault())

  // ★ THE KEY: makes window invisible to ALL screen capture at OS level
  overlayWin.setContentProtection(true)
  overlayWin.setAlwaysOnTop(true, 'screen-saver', 1)
  overlayWin.setIgnoreMouseEvents(true, { forward: true })

  overlayWin.loadFile(path.join(__dirname, 'overlay.html'))

  // Re-apply protection after show (Electron quirk — hide/show clears it)
  overlayWin.on('show', () => {
    overlayWin.setContentProtection(true)
    overlayWin.setAlwaysOnTop(true, 'screen-saver', 1)
  })
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 580,
    height: 720,
    title: 'StealthGod Settings',
    resizable: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  settingsWin.webContents.on('will-navigate', (e) => e.preventDefault())
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.once('ready-to-show', () => {
    settingsWin.show()
    settingsWin.focus()
  })
}

// ─── Audio Bridge ────────────────────────────────────────────────────────────
const BRIDGE_SECRET = crypto.randomBytes(24).toString('hex')
let audioBridgeProcess = null
let wsClient = null
let isListening = false
let audioBuffer = []
let silenceTimer = null
const SILENCE_TIMEOUT_MS = 2200   // 2.2 s of silence = question finished

function startAudioBridge() {
  const bridgeScript = path.join(__dirname, '..', 'audio_bridge', 'server.py')
  audioBridgeProcess = spawn('python', [bridgeScript], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', STEALTH_BRIDGE_TOKEN: BRIDGE_SECRET }
  })

  audioBridgeProcess.stdout.on('data', d => console.log('[bridge]', d.toString().trim()))
  audioBridgeProcess.stderr.on('data', d => console.error('[bridge]', d.toString().trim()))

  // Give Python server 1.5 s to start, then connect
  setTimeout(connectToAudioBridge, 1500)
}

function connectToAudioBridge() {
  try {
    wsClient = new WebSocket('ws://127.0.0.1:8765', {
      headers: {
        'x-bridge-token': BRIDGE_SECRET
      }
    })

    wsClient.on('open', () => {
      console.log('[audio] Connected to bridge')
      overlayWin?.webContents.send('status', { listening: true, msg: 'Listening...' })
      isListening = true
    })

    let speechDetected = false
    let speechStartTime = 0

    wsClient.on('message', (data) => {
      if (!isListening) return

      const samples = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2)
      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i])
      }
      const energy = sum / samples.length

      // Lower threshold to 80 so quiet Discord voices/headphones are caught easily
      if (energy > 80) {
        if (!speechDetected) {
          speechDetected = true
          speechStartTime = Date.now()
          overlayWin?.webContents.send('status', { listening: true, thinking: false, msg: 'Hearing speech...' })
        }
        audioBuffer.push(data)
        clearTimeout(silenceTimer)
        const timeoutMs = (config.silenceTimeout || 2.2) * 1000
        silenceTimer = setTimeout(() => {
          speechDetected = false
          processAudioBuffer()
        }, timeoutMs)
      } else if (speechDetected) {
        // Collect a little trailing silence to capture word endings smoothly
        audioBuffer.push(data)
        // Generous cutoff after 90s so even long, detailed scenario questions are fully captured
        if (Date.now() - speechStartTime > 90000) {
          speechDetected = false
          clearTimeout(silenceTimer)
          processAudioBuffer()
        }
      }
    })

    wsClient.on('error', (e) => {
      console.error('[audio] WS error:', e.message)
      setTimeout(connectToAudioBridge, 3000)
    })

    wsClient.on('close', () => {
      console.log('[audio] Bridge closed, reconnecting...')
      isListening = false
      setTimeout(connectToAudioBridge, 3000)
    })
  } catch (e) {
    console.error('[audio] Connect failed:', e.message)
    setTimeout(connectToAudioBridge, 3000)
  }
}

async function processAudioBuffer() {
  if (audioBuffer.length === 0) return
  const chunks = audioBuffer.splice(0)          // Take and clear buffer

  if (!config.groqApiKey && !config.apiKey) {
    overlayWin?.webContents.send('error', 'No API key — press Ctrl+Shift+S to set one')
    return
  }

  overlayWin?.webContents.send('status', { thinking: true, msg: 'Processing...' })

  try {
    const combined = Buffer.concat(chunks)
    const b64Audio = combined.toString('base64')

    overlayWin?.webContents.send('answer-start')

    await ai.streamAnswer({
      pcmBuffer: combined,
      audioBase64: b64Audio,
      groqApiKey: config.groqApiKey || '',
      apiKey: config.apiKey || '',
      candidateName: config.candidateName || '',
      resumeContext: config.resumeContext || config.userContext || '',
      jobDescription: config.jobDescription || '',
      onQuestion: (q) => overlayWin?.webContents.send('question', q),
      onToken: (t) => overlayWin?.webContents.send('answer-token', t),
      onDone: () => {
        overlayWin?.webContents.send('answer-done')
        overlayWin?.webContents.send('status', { listening: true, msg: 'Listening...' })
        // Only auto-clear if delay > 0; if 0, keep answer until next question or manual clear
        const delaySec = config.autoClearDelay != null ? config.autoClearDelay : 0
        if (delaySec > 0) {
          setTimeout(() => overlayWin?.webContents.send('clear'), delaySec * 1000)
        }
      }
    })
  } catch (e) {
    console.error('[ai] Error:', e.message)
    overlayWin?.webContents.send('error', 'AI error: ' + e.message)
    overlayWin?.webContents.send('status', { listening: true, msg: 'Listening...' })
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => config)

ipcMain.handle('save-config', (_, newCfg) => {
  config = { ...config, ...newCfg }
  saveConfig(config)
  // Resize and reposition overlay dynamically
  if (overlayWin && !overlayWin.isDestroyed()) {
    const bounds = calculateOverlayBounds()
    overlayWin.setBounds(bounds)
    overlayWin.webContents.send('config-updated', config)
  }
  return { ok: true }
})

ipcMain.handle('open-url', (_, url) => {
  if (typeof url !== 'string') return
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return shell.openExternal(url)
    }
  } catch {}
})

ipcMain.handle('toggle-listen', () => {
  isListening = !isListening
  overlayWin?.webContents.send('status', {
    listening: isListening,
    msg: isListening ? 'Listening...' : 'Paused'
  })
  return isListening
})

// ─── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  process.title = 'System Utility'

  createOverlay()
  startAudioBridge()

  // Global hotkeys — work even when Chrome is focused
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!overlayWin) return
    if (overlayWin.isVisible()) {
      overlayWin.hide()
    } else {
      overlayWin.show()
      overlayWin.setContentProtection(true)
      overlayWin.setAlwaysOnTop(true, 'screen-saver', 1)
    }
  })

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    overlayWin?.webContents.send('clear')
  })

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    openSettings()
  })

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    isListening = !isListening
    overlayWin?.webContents.send('status', {
      listening: isListening,
      msg: isListening ? 'Listening...' : 'Paused'
    })
  })

  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    overlayWin?.webContents.send('scroll', 1)
  })

  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    overlayWin?.webContents.send('scroll', -1)
  })

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit()
  })

  // If first time running and no API keys are set, open Settings automatically
  if (!config.groqApiKey && !config.apiKey) {
    setTimeout(openSettings, 800)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (audioBridgeProcess) audioBridgeProcess.kill()
  if (wsClient) wsClient.close()
})

app.on('window-all-closed', () => {
  // Keep running even if all windows are closed (menu bar app style)
})
