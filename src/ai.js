// Unified AI provider: Groq (Whisper-large-v3-turbo + gpt-oss-120b) and Gemini fallback

const SYSTEM_PROMPT = `You are a real-time AI interview assistant helping a job candidate answer interview questions live.

Rules for the answer:
- Write in first person as if the candidate is speaking ("I worked on...", "In my experience...")
- 3 to 4 sentences maximum — keep it punchy, direct, and natural
- Sound conversational, confident, and professional
- If technical, give specific technologies and concrete numbers/results
- Plain text only. No bullet points, no markdown, no headings.`

/**
 * Creates a valid WAV file buffer from raw 16kHz 16-bit mono PCM bytes
 */
function pcmToWav(pcmBuffer, sampleRate = 16000) {
  const wavHeader = Buffer.alloc(44)
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmBuffer.length
  const chunkSize = 36 + dataSize

  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(chunkSize, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16) // Subchunk1Size
  wavHeader.writeUInt16LE(1, 20)  // AudioFormat (PCM)
  wavHeader.writeUInt16LE(numChannels, 22)
  wavHeader.writeUInt32LE(sampleRate, 24)
  wavHeader.writeUInt32LE(byteRate, 28)
  wavHeader.writeUInt16LE(blockAlign, 32)
  wavHeader.writeUInt16LE(bitsPerSample, 34)
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(dataSize, 40)

  return Buffer.concat([wavHeader, pcmBuffer])
}

/**
 * Transcribe PCM audio using Groq Whisper Turbo (<0.2s)
 */
async function transcribeWithGroq(pcmBuffer, groqApiKey) {
  const wavData = pcmToWav(pcmBuffer, 16000)
  const boundary = '----StealthGodMultipartBoundary' + Date.now()

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n`
  ]
  const part1 = Buffer.from(parts.join(''), 'utf-8')
  const part2 = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  const payload = Buffer.concat([part1, wavData, part2])

  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': 'StealthGod/1.0'
    },
    body: payload
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Groq Whisper error ${resp.status}: ${err}`)
  }

  const json = await resp.json()
  return (json.text || '').trim()
}

function buildContextInstruction(candidateName, resumeContext, jobDescription) {
  let ctx = `You are a real-time speech wingman helping me in a live job interview.
You speak AS ME in the first person ("I", "my").

CRITICAL RULES FOR NATURAL HUMAN SPEECH:
1. MATCH THE QUESTION LENGTH & ENERGY:
   - If the question is simple, conversational, or factual (e.g. "What is your name?", "How are you?", "Where are you based?", "Can you hear me?"), answer in ONE short, natural sentence (e.g. "My name is ${candidateName || 'Alex'}, nice to meet you." or "I'm doing well, thanks for asking!"). NEVER over-explain simple questions.
   - For behavioral or technical questions (e.g. "Tell me about a challenging bug", "How do you handle deadlines?"), give 2 to 3 concise, punchy sentences.
2. SOUND HUMAN, NOT LIKE AN AI:
   - Speak naturally like a real engineer having a conversation.
   - Do NOT use formal corporate buzzwords ("spearheaded synergistic leverage", "testament to my dedication").
   - Plain spoken text only. No bullet points, no markdown, no quotes, no labels like "Answer:".`

  if (candidateName && candidateName.trim()) {
    ctx += `\n\n👤 MY NAME: ${candidateName.trim()}`
  }

  if (jobDescription && jobDescription.trim()) {
    ctx += `\n\n🎯 TARGET ROLE / JOB DESCRIPTION:\n${jobDescription.trim()}`
  }

  if (resumeContext && resumeContext.trim()) {
    ctx += `\n\n📄 MY RESUME & EXPERIENCE (Draw real tech and achievements from here when relevant):\n${resumeContext.trim()}`
  }

  return ctx
}

/**
 * Stream answer using Groq (gpt-oss-120b or qwen3.8-27b)
 */
async function streamAnswerFromGroq(questionText, candidateName, resumeContext, jobDescription, groqApiKey, onToken, onDone) {
  const systemInstruction = buildContextInstruction(candidateName, resumeContext, jobDescription)

  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: `Interviewer: "${questionText}"\nRespond naturally and directly as me:` }
  ]

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'StealthGod/1.0'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.6,
      max_tokens: 350,
      stream: true
    })
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Groq LLM error ${resp.status}: ${err}`)
  }

  const decoder = new TextDecoder()
  let buf = ''

  for await (const chunk of resp.body) {
    buf += decoder.decode(chunk, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const dataStr = trimmed.slice(6)
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const token = parsed?.choices?.[0]?.delta?.content
        if (token) onToken(token)
      } catch {}
    }
  }

  onDone()
}

/**
 * Master dispatcher:
 * If Groq key is present -> Groq Whisper + Groq LLM (Blazing fast ~0.3s)
 * If only Gemini key -> Gemini 3.8-flash
 */
async function streamAnswer({ pcmBuffer, audioBase64, groqApiKey, apiKey, candidateName, resumeContext, jobDescription, onQuestion, onToken, onDone }) {
  if (groqApiKey && groqApiKey.startsWith('gsk_')) {
    // 1. Transcribe audio with Groq Whisper
    const question = await transcribeWithGroq(pcmBuffer, groqApiKey)
    if (!question || question.length < 3) {
      onDone()
      return
    }

    onQuestion(question)

    // 2. Stream answer with Groq LLM aligning Resume & Job Description
    await streamAnswerFromGroq(question, candidateName, resumeContext, jobDescription, groqApiKey, onToken, onDone)
    return
  }

  // Fallback to Gemini if no Groq key
  const systemInstruction = buildContextInstruction(candidateName, resumeContext, jobDescription)
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'audio/pcm;rate=16000', data: audioBase64 } },
        { text: 'Transcribe the interview question and answer it.' }
      ]
    }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 350 }
  }

  const candidateModels = ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.8-flash']
  let resp = null

  for (const model of candidateModels) {
    try {
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (resp.ok) break
    } catch {}
  }

  if (!resp || !resp.ok) {
    throw new Error('AI service error')
  }

  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  let questionSent = false

  for await (const chunk of resp.body) {
    buf += decoder.decode(chunk, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const dataStr = line.slice(6).trim()
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!token) continue
        full += token
        if (!questionSent && full.includes('A:')) {
          const qPart = full.split('A:')[0].replace(/^Q:\s*/i, '').trim()
          onQuestion(qPart)
          questionSent = true
          onToken(full.split('A:')[1].trim())
        } else if (questionSent) {
          onToken(token)
        }
      } catch {}
    }
  }
  onDone()
}

module.exports = { streamAnswer }
