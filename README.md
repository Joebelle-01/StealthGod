# StealthGod

> AI interview assistant — invisible to screen capture (uses Windows `WDA_EXCLUDEFROMCAPTURE`)

## Quick Start (For New Machines)

Open PowerShell or Command Prompt in this folder:

```bash
# 1. Install Python audio dependencies
pip install -r requirements.txt

# 2. Install Node dependencies
npm install

# 3. Launch
start.bat
# (Or run: npm start)
```

> **Note:** On first launch, the **Settings window opens automatically** so you can enter your API keys.

---

## First Time Setup

1. **Open Settings**: Press **`Ctrl` + `Shift` + `S`** (or wait for it to open automatically on first run)
2. **Groq API Key (Recommended)**: Get a free key at [console.groq.com](https://console.groq.com) and paste it into the Groq field for ~0.3s response time.
3. **Your Name**: Enter your name for natural answers to "What is your name?".
4. **Resume**: Paste your experience summary.
5. **Job Description**: Paste the target job posting requirements.
6. Click **Save Settings**.

---

## Global Hotkeys

| Hotkey | Action |
|---|---|
| `Ctrl+Shift+S` | **Open Settings** |
| `Ctrl+Shift+H` | **Emergency Hide / Show** overlay |
| `Ctrl+Shift+C` | **Clear answer** immediately |
| `Ctrl+Shift+Down (↓)` | **Scroll down** long answers |
| `Ctrl+Shift+Up (↑)` | **Scroll up** |
| `Ctrl+Shift+R` | Pause / Resume audio capture |
| `Ctrl+Shift+Q` | Quit app completely |

---

## Requirements

- **Windows 10** (build 2004+) or **Windows 11**
- **Node.js 18+**
- **Python 3.8+**
- Speakers or headphones with audio playing (WASAPI loopback captures live playback)
