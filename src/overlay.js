/* global stealthAPI */
'use strict'

const dot       = document.getElementById('dot')
const statusMsg = document.getElementById('statusMsg')
const qText     = document.getElementById('qText')
const answerEl  = document.getElementById('answerLine')
const errorEl   = document.getElementById('errorMsg')

let currentAnswer = ''

// ── Apply config ─────────────────────────────────────────────────────────────
async function applyConfig() {
  const cfg = await stealthAPI.getConfig()
  if (cfg.fontSize) answerEl.style.fontSize = cfg.fontSize + 'px'
  if (cfg.opacity !== undefined) {
    document.getElementById('container').style.background =
      `rgba(8, 8, 12, ${cfg.opacity})`
  }
}

stealthAPI.onConfigUpdated((cfg) => {
  if (cfg.fontSize) answerEl.style.fontSize = cfg.fontSize + 'px'
  if (cfg.opacity !== undefined) {
    document.getElementById('container').style.background =
      `rgba(8, 8, 12, ${cfg.opacity})`
  }
})

applyConfig()

// ── Status updates ───────────────────────────────────────────────────────────
stealthAPI.onStatus(({ listening, thinking, paused, msg }) => {
  statusMsg.textContent = msg || ''
  dot.className = thinking ? 'thinking' : (paused || !listening) ? 'paused' : ''
  errorEl.style.display = 'none'
})

// ── Incoming question ────────────────────────────────────────────────────────
stealthAPI.onQuestion((q) => {
  qText.textContent = q
  currentAnswer = ''
  answerEl.textContent = ''
  answerEl.classList.add('streaming')
  errorEl.style.display = 'none'
})

// ── Answer starts ─────────────────────────────────────────────────────────────
stealthAPI.onAnswerStart(() => {
  answerEl.classList.add('streaming')
  dot.className = 'thinking'
  statusMsg.textContent = 'Answering...'
})

// ── Stream tokens ─────────────────────────────────────────────────────────────
stealthAPI.onAnswerToken((token) => {
  currentAnswer += token
  answerEl.textContent = currentAnswer
  // Automatically scroll to reveal newly generated text while streaming
  answerEl.scrollTop = answerEl.scrollHeight
})

// Listen for scroll IPC commands (e.g. from hotkeys)
if (stealthAPI.onScroll) {
  stealthAPI.onScroll((dir) => {
    answerEl.scrollTop += dir * 40
  })
}

// ── Answer done ───────────────────────────────────────────────────────────────
stealthAPI.onAnswerDone(() => {
  answerEl.classList.remove('streaming')
  dot.className = ''
})

// ── Clear ─────────────────────────────────────────────────────────────────────
stealthAPI.onClear(() => {
  currentAnswer = ''
  qText.textContent = ''
  answerEl.textContent = ''
  answerEl.classList.remove('streaming')
  errorEl.style.display = 'none'
  statusMsg.textContent = 'Listening...'
  dot.className = ''
})

// ── Errors ────────────────────────────────────────────────────────────────────
stealthAPI.onError((msg) => {
  errorEl.textContent = '⚠ ' + msg
  errorEl.style.display = 'block'
  dot.className = 'error'
  setTimeout(() => {
    errorEl.style.display = 'none'
    dot.className = ''
  }, 6000)
})
