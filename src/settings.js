/* global stealthAPI */
'use strict'

const groqApiKeyEl     = document.getElementById('groqApiKey')
const candidateNameEl  = document.getElementById('candidateName')
const resumeContextEl  = document.getElementById('resumeContext')
const jobDescriptionEl = document.getElementById('jobDescription')
const overlayPosEl     = document.getElementById('overlayPosition')
const overlayWidthEl   = document.getElementById('overlayWidth')
const overlayHEl       = document.getElementById('overlayHeight')
const fontSizeEl       = document.getElementById('fontSize')
const opacityEl        = document.getElementById('opacity')
const opacityValEl     = document.getElementById('opacityVal')
const autoClearEl        = document.getElementById('autoClearDelay')
const autoClearValEl     = document.getElementById('autoClearVal')
const silenceTimeoutEl   = document.getElementById('silenceTimeout')
const silenceTimeoutValEl= document.getElementById('silenceTimeoutVal')
const saveBtn            = document.getElementById('saveBtn')
const cancelBtn          = document.getElementById('cancelBtn')
const toast              = document.getElementById('toast')

// ── Load current config ───────────────────────────────────────────────────────
stealthAPI.getConfig().then((cfg) => {
  if (cfg.groqApiKey)      groqApiKeyEl.value = cfg.groqApiKey
  if (cfg.apiKey)          apiKeyEl.value = cfg.apiKey
  if (cfg.candidateName)   candidateNameEl.value = cfg.candidateName
  if (cfg.resumeContext) {
    resumeContextEl.value = cfg.resumeContext
  } else if (cfg.userContext) {
    resumeContextEl.value = cfg.userContext
  }
  if (cfg.jobDescription)  jobDescriptionEl.value = cfg.jobDescription
  if (cfg.overlayPosition) overlayPosEl.value = cfg.overlayPosition
  if (cfg.overlayWidth)    overlayWidthEl.value = cfg.overlayWidth
  if (cfg.overlayHeight)   overlayHEl.value = String(cfg.overlayHeight)
  if (cfg.fontSize)        fontSizeEl.value = String(cfg.fontSize)
  if (cfg.opacity != null) {
    opacityEl.value = String(cfg.opacity)
    opacityValEl.textContent = Math.round(cfg.opacity * 100) + '%'
  }
  if (cfg.silenceTimeout != null) {
    silenceTimeoutEl.value = String(cfg.silenceTimeout)
    silenceTimeoutValEl.textContent = cfg.silenceTimeout + 's'
  }
  if (cfg.autoClearDelay != null) {
    autoClearEl.value = String(cfg.autoClearDelay)
    autoClearValEl.textContent = cfg.autoClearDelay === 0 ? 'Never (Manual)' : cfg.autoClearDelay + 's'
  }
})

// ── Live range feedback ───────────────────────────────────────────────────────
opacityEl.addEventListener('input', () => {
  opacityValEl.textContent = Math.round(parseFloat(opacityEl.value) * 100) + '%'
})

silenceTimeoutEl.addEventListener('input', () => {
  silenceTimeoutValEl.textContent = silenceTimeoutEl.value + 's'
})

autoClearEl.addEventListener('input', () => {
  const val = parseInt(autoClearEl.value, 10)
  autoClearValEl.textContent = val === 0 ? 'Never (Manual)' : val + 's'
})

// ── External links ────────────────────────────────────────────────────────────
document.getElementById('groqLink').addEventListener('click', () => {
  stealthAPI.openUrl('https://console.groq.com')
})

document.getElementById('apiLink').addEventListener('click', () => {
  stealthAPI.openUrl('https://aistudio.google.com/app/apikey')
})

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  const cfg = {
    groqApiKey:      groqApiKeyEl.value.trim(),
    apiKey:          (document.getElementById('apiKey')?.value || '').trim(),
    candidateName:   candidateNameEl.value.trim(),
    resumeContext:   resumeContextEl.value.trim(),
    jobDescription:  jobDescriptionEl.value.trim(),
    overlayPosition: overlayPosEl.value,
    overlayWidth:    overlayWidthEl.value,
    overlayHeight:   parseInt(overlayHEl.value, 10),
    fontSize:        parseInt(fontSizeEl.value, 10),
    opacity:         parseFloat(opacityEl.value),
    silenceTimeout:  parseFloat(silenceTimeoutEl.value),
    autoClearDelay:  parseInt(autoClearEl.value, 10)
  }

  await stealthAPI.saveConfig(cfg)

  toast.style.display = 'block'
  setTimeout(() => { toast.style.display = 'none' }, 2500)
})

// ── Cancel ────────────────────────────────────────────────────────────────────
cancelBtn.addEventListener('click', () => window.close())
