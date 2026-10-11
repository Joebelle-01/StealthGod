# StealthGod

> AI interview assistant — invisible to screen capture (uses Windows `WDA_EXCLUDEFROMCAPTURE`)

## Quick Start

```bash
# 1. Install Python packages
pip install pyaudiowpatch websockets

# 2. Install Node packages
npm install

# 3. Launch (double-click or run in terminal)
start.bat
```

## First Time Setup

1. Press **Ctrl+Shift+S** to open Settings
2. Paste your **Gemini API key** (free at https://aistudio.google.com/app/apikey)
3. Paste a short **resume/background summary** for personalized answers
4. Click **Save**

## Hotkeys

| Key | Action |
|-----|--------|
| `Ctrl+Shift+H` | Hide / Show overlay (emergency) |
| `Ctrl+Shift+C` | Clear current answer |
| `Ctrl+Shift+S` | Open Settings |
| `Ctrl+Shift+R` | Pause / Resume listening |
| `Ctrl+Shift+Q` | Quit |

## How It Works

- **Audio**: Captures system audio via Windows WASAPI loopback (hears whatever plays through your speakers — including interviewer's voice from Google Meet)
- **AI**: Sends audio to Gemini 2.0 Flash → transcribes question + streams answer
- **Stealth**: `win.setContentProtection(true)` → window is invisible to ALL screen capture at OS level (Chrome, Zoom, OBS, PrintScreen) while remaining visible to you

## Requirements

- Windows 10 (version 2004+) or Windows 11
- Node.js 18+
- Python 3.8+
- Speakers or headphones (WASAPI loopback captures what plays through them)
