import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { demoAPI } from '../../services/api'

const INDUSTRIES = [
  'Healthcare', 'Real Estate', 'Legal', 'Insurance', 'Home Services',
  'Restaurant', 'Automotive', 'Education', 'Finance', 'E-commerce', 'Other'
]

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese']

const TONES = ['Professional', 'Friendly', 'Casual', 'Formal', 'Empathetic']

const AGENT_NAMES = {
  English: ['Alex', 'Jordan', 'Sam', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Avery', 'Quinn', 'Blake'],
  Spanish: ['Carlos', 'Sofía', 'Mateo', 'Valentina', 'Diego', 'Camila', 'Andrés', 'Lucía', 'Pablo', 'Elena'],
}

const LANG_CODES = { English: 'en', Spanish: 'es', French: 'fr', German: 'de', Italian: 'it', Portuguese: 'pt' }

const getRandomAgentName = (language) => {
  const names = AGENT_NAMES[language] || AGENT_NAMES.English
  return names[Math.floor(Math.random() * names.length)]
}

const VOICES = {
  English: [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Female — Warm & Friendly' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Female — Soft & Professional' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Female — Confident' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Female — British' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Male — Deep & Authoritative' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Male — Narrative' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', desc: 'Male — Friendly' },
    { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', desc: 'Male — Confident & Warm' },
  ],
  Spanish: [
    { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Femenina — Cálida y Natural' },
    { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Femenina — Clara y Amable' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Femenina — Suave y Profesional' },
    { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', desc: 'Femenina — Tranquila' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Masculina — Confiable' },
    { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Masculina — Narrativo' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Masculina — Profundo' },
    { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Masculina — Seguro' },
  ],
}

const CALENDLY_URL = 'https://calendly.com/guillermosword/30min'

export default function DemoPage() {
  const { darkMode, toggleDarkMode } = useTheme()
  const { t, language, toggleLanguage } = useLanguage()

  const [phase, setPhase] = useState('form') // form | loading | results
  const [error, setError] = useState('')
  const [showCalendly, setShowCalendly] = useState(false)
  const [calendlyLoaded, setCalendlyLoaded] = useState(false)
  const [branding, setBranding] = useState({ companyName: null, companyLogo: null, companyTagline: null })

  // Form state
  const [form, setForm] = useState({
    callerName: '',
    businessName: '',
    industry: '',
    agentObjective: '',
    agentType: 'inbound',
    language: 'English',
    tone: 'Professional',
    faq: '',
    objections: ''
  })

  // Results state
  const [demoId, setDemoId] = useState(null)
  const [chatbotPrompt, setChatbotPrompt] = useState('')
  const [voicebotPrompt, setVoicebotPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(VOICES.English[0].id)

  // Voice call state
  const [callStatus, setCallStatus] = useState('idle') // idle | connecting | active | ended
  const [voiceTranscript, setVoiceTranscript] = useState([])
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState(0)
  const [voiceElapsed, setVoiceElapsed] = useState(0)
  const [voiceError, setVoiceError] = useState('')
  const vapiRef = useRef(null)
  const voiceTimerRef = useRef(null)
  const transcriptEndRef = useRef(null)

  const messagesEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const demoSectionRef = useRef(null)
  const calendlySectionRef = useRef(null)

  // Derive available voices from selected language (fallback to English)
  const availableVoices = VOICES[form.language] || VOICES.English

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [voiceTranscript])

  // Cleanup VAPI on unmount or tab switch
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop()
        vapiRef.current = null
      }
      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current)
        voiceTimerRef.current = null
      }
    }
  }, [])

  // Load Calendly widget script dynamically
  useEffect(() => {
    if (!showCalendly || calendlyLoaded) return
    const script = document.createElement('script')
    script.src = 'https://assets.calendly.com/assets/external/widget.js'
    script.async = true
    script.onload = () => setCalendlyLoaded(true)
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [showCalendly, calendlyLoaded])

  // Scroll to Calendly section when it becomes visible
  useEffect(() => {
    if (showCalendly && calendlySectionRef.current) {
      setTimeout(() => {
        calendlySectionRef.current.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [showCalendly])

  // Fetch branding on mount
  useEffect(() => {
    demoAPI.getBranding().then(res => {
      if (res.data) setBranding(res.data)
    }).catch(() => {})
  }, [])

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    if (!form.businessName.trim()) return 'Business Name is required'
    if (!form.industry) return 'Industry is required'
    if (!form.agentObjective.trim()) return 'Agent Objective is required'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setPhase('loading')

    try {
      const res = await demoAPI.generate(form)
      const data = res.data

      setDemoId(data.demoId)
      setChatbotPrompt(data.chatbotPrompt)
      setVoicebotPrompt(data.voicebotPrompt)
      setFirstMessage(data.firstMessage)
      setMessages([{ role: 'assistant', content: data.firstMessage }])
      const voices = VOICES[form.language] || VOICES.English
      setSelectedVoice(voices[0].id)
      setPhase('results')
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate demo. Please try again.'
      setError(msg)
      setPhase('form')
    }
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || isSending) return

    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsSending(true)

    // Add a placeholder for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${baseURL}/demo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoId, message: text })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: err.error || 'Something went wrong.' }
          return updated
        })
        setIsSending(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: parsed.error }
                return updated
              })
              setIsSending(false)
              return
            }
            if (parsed.content) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + parsed.content
                }
                return updated
              })
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Network error. Please try again.' }
        return updated
      })
    }

    setIsSending(false)
    chatInputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleStartOver = () => {
    // Stop any active voice call
    if (vapiRef.current) {
      vapiRef.current.stop()
      vapiRef.current = null
    }
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current)
      voiceTimerRef.current = null
    }

    setPhase('form')
    setDemoId(null)
    setChatbotPrompt('')
    setVoicebotPrompt('')
    setFirstMessage('')
    setMessages([])
    setChatInput('')
    setActiveTab('chat')
    setError('')
    setCallStatus('idle')
    setVoiceTranscript([])
    setVoiceMuted(false)
    setVoiceVolume(0)
    setVoiceElapsed(0)
    setVoiceError('')
    setShowCalendly(false)
    setCalendlyLoaded(false)
  }

  const handleBookCall = () => {
    setShowCalendly(true)
  }

  const scrollToDemo = () => {
    demoSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // ─── VOICE CALL FUNCTIONS ───
  const startVoiceCall = async () => {
    try {
      setCallStatus('connecting')
      setVoiceTranscript([])
      setVoiceElapsed(0)
      setVoiceMuted(false)
      setVoiceVolume(0)
      setVoiceError('')

      // Fetch VAPI public key
      let publicKey
      try {
        const { data } = await demoAPI.getVapiKey()
        publicKey = data.vapiPublicKey
      } catch (err) {
        const msg = err.response?.data?.error || 'Voice calling is not configured. Please try the chat demo instead.'
        setVoiceError(msg)
        setCallStatus('idle')
        return
      }

      // Dynamic import VAPI SDK
      const { default: Vapi } = await import('@vapi-ai/web')
      const vapi = new Vapi(publicKey)
      vapiRef.current = vapi

      vapi.on('call-start', () => {
        setCallStatus('active')
        voiceTimerRef.current = setInterval(() => {
          setVoiceElapsed(prev => prev + 1)
        }, 1000)
      })

      vapi.on('call-end', () => {
        setCallStatus('ended')
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current)
          voiceTimerRef.current = null
        }
      })

      vapi.on('message', (msg) => {
        if (msg.type === 'transcript') {
          if (msg.transcriptType === 'final') {
            setVoiceTranscript(prev => [...prev, {
              role: msg.role === 'assistant' ? 'Agent' : 'You',
              text: msg.transcript
            }])
          }
        } else if (msg.type === 'conversation-update' && msg.conversation) {
          const convMessages = msg.conversation
          setVoiceTranscript(
            convMessages
              .filter(m => m.role === 'assistant' || m.role === 'user')
              .map(m => ({
                role: m.role === 'assistant' ? 'Agent' : 'You',
                text: m.content
              }))
          )
        }
      })

      vapi.on('volume-level', (level) => {
        setVoiceVolume(level)
      })

      vapi.on('error', (err) => {
        console.error('VAPI demo call error:', err)
        setCallStatus('ended')
        setVoiceTranscript(prev => [...prev, {
          role: 'System',
          text: `Error: ${err.message || 'Call failed'}`
        }])
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current)
          voiceTimerRef.current = null
        }
      })

      // Start with inline assistant config
      const agentName = getRandomAgentName(form.language)
      const langCode = LANG_CODES[form.language] || 'en'

      const nameInstruction = form.language === 'Spanish'
        ? `IMPORTANTE: Tu nombre es ${agentName}. Siempre usa este nombre cuando te presentes o te pregunten tu nombre. Nunca uses otro nombre.\n\n`
        : `IMPORTANT: Your name is ${agentName}. Always use this name when introducing yourself or when asked your name. Never use any other name.\n\n`

      const patchedFirstMessage = firstMessage.replace(
        /(?:this is|soy|me llamo|mi nombre es|I'm|I am|habla)\s+\S+/i,
        (match) => match.replace(/\s+\S+$/, ` ${agentName}`)
      )

      await vapi.start({
        name: agentName,
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: nameInstruction + voicebotPrompt }]
        },
        voice: {
          provider: '11labs',
          voiceId: selectedVoice,
          ...(form.language !== 'English' && { model: 'eleven_multilingual_v2' })
        },
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: langCode
        },
        firstMessage: patchedFirstMessage
      })
    } catch (err) {
      console.error('Failed to start demo voice call:', err)
      setCallStatus('ended')
      setVoiceTranscript(prev => [...prev, {
        role: 'System',
        text: `Error: ${err.message || 'Failed to start call'}`
      }])
    }
  }

  const stopVoiceCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop()
      vapiRef.current = null
    }
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current)
      voiceTimerRef.current = null
    }
    setCallStatus('ended')
  }

  const toggleVoiceMute = () => {
    if (vapiRef.current) {
      const newMuted = !voiceMuted
      vapiRef.current.setMuted(newMuted)
      setVoiceMuted(newMuted)
    }
  }

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = (seconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  // ─── NAVBAR ───
  const renderNavbar = () => (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-md border-b border-gray-200 dark:border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          {branding.companyLogo ? (
            <img src={branding.companyLogo} alt={branding.companyName || 'Logo'} className="h-8 w-8 rounded-lg object-contain bg-white dark:bg-dark-hover" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3 9l9 13 9-13-9-7z" fill="white" opacity="0.9"/>
                <path d="M12 2L3 9h18L12 2z" fill="white"/>
              </svg>
            </div>
          )}
          <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
            {branding.companyName || 'Sword AI'}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="p-2 rounded-lg bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover text-sm font-medium"
          >
            {language === 'en' ? 'ES' : 'EN'}
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Try Demo CTA - hidden on mobile */}
          <button
            onClick={scrollToDemo}
            className="hidden sm:inline-flex px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Try Demo
          </button>
        </div>
      </div>
    </nav>
  )

  // ─── HERO ───
  const renderHero = () => (
    <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 sm:px-6">
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white leading-tight max-w-4xl">
        AI Agents That Work{' '}
        <span className="text-primary-600 dark:text-primary-400">For Your Business</span>
      </h1>
      <p className="mt-6 text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl">
        Generate a custom AI chat and voice agent for your business in seconds.
        No code required — just describe what you need.
      </p>
      <button
        onClick={scrollToDemo}
        className="mt-10 px-8 py-3.5 bg-primary-600 text-white text-lg font-semibold rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 hover:shadow-primary-600/30"
      >
        Try It Free
      </button>
      {/* Scroll hint */}
      <div className="mt-16 animate-bounce text-gray-400 dark:text-gray-500">
        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  )

  // ─── FEATURES ───
  const renderFeatures = () => {
    const features = [
      {
        icon: (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        ),
        title: '24/7 Call Handling',
        description: 'Never miss a call again. Your AI agent answers and handles customer inquiries around the clock.'
      },
      {
        icon: (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
        title: 'Instant Chat Support',
        description: 'Embed a smart chatbot on your website that resolves questions and books appointments instantly.'
      },
      {
        icon: (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Multilingual',
        description: 'Serve customers in English, Spanish, French, and more — your agent adapts to their language.'
      },
      {
        icon: (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
        title: 'Ready in Minutes',
        description: 'No complex setup. Describe your business and goals — we generate a production-ready agent instantly.'
      }
    ]

    return (
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
            Powerful AI agents that handle calls, chats, and more — so you can focus on growing your business.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // ─── FORM PHASE ───
  const renderForm = () => (
    <div className="w-full max-w-2xl mx-auto">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 space-y-5">
        {/* Your Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Your Name
          </label>
          <input
            type="text"
            value={form.callerName}
            onChange={(e) => updateForm('callerName', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. John"
          />
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Business Name *
          </label>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => updateForm('businessName', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. Acme Dental Care"
          />
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Industry *
          </label>
          <select
            value={form.industry}
            onChange={(e) => updateForm('industry', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="">Select an industry</option>
            {INDUSTRIES.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>

        {/* Agent Objective */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Agent Objective *
          </label>
          <textarea
            value={form.agentObjective}
            onChange={(e) => updateForm('agentObjective', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Describe what you want your AI agent to do..."
          />
        </div>

        {/* Agent Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Agent Type *
          </label>
          <div className="flex gap-4">
            {['inbound', 'outbound'].map(type => (
              <label
                key={type}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  form.agentType === type
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-gray-50 dark:bg-dark-hover border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border'
                }`}
              >
                <input
                  type="radio"
                  name="agentType"
                  value={type}
                  checked={form.agentType === type}
                  onChange={(e) => updateForm('agentType', e.target.value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium capitalize">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Language & Tone row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Language *
            </label>
            <select
              value={form.language}
              onChange={(e) => updateForm('language', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tone / Style
            </label>
            <select
              value={form.tone}
              onChange={(e) => updateForm('tone', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {TONES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* FAQ (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            FAQ (optional)
          </label>
          <textarea
            value={form.faq}
            onChange={(e) => updateForm('faq', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Add common questions and answers your agent should know..."
          />
        </div>

        {/* Common Objections (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Common Objections (optional)
          </label>
          <textarea
            value={form.objections}
            onChange={(e) => updateForm('objections', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Add objections your agent should handle..."
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
        >
          Generate Demo
        </button>
      </form>
    </div>
  )

  // ─── LOADING PHASE ───
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mb-6"></div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Generating your AI agent...
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        This may take a moment. We're crafting the perfect prompt for your business.
      </p>
    </div>
  )

  // ─── BOOK CALL CTA ───
  const renderBookCallCTA = () => (
    <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 text-center mt-6">
      <p className="text-sm text-primary-600 dark:text-primary-400 mb-3">
        Ready to deploy this AI agent for your business? Book a free call with our team.
      </p>
      <button
        onClick={handleBookCall}
        className="inline-block px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors text-sm"
      >
        Book Your Free Call
      </button>
    </div>
  )

  // ─── RESULTS PHASE ───
  const renderResults = () => (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Your AI Agent Demo
        </h1>
        <button
          onClick={handleStartOver}
          className="px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover rounded-lg text-sm transition-colors"
        >
          Start Over
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-dark-hover rounded-lg p-1">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Chat Demo
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'voice'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Voice Demo
        </button>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border flex flex-col" style={{ height: '500px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-dark-hover text-gray-900 dark:text-white rounded-bl-md'
                  }`}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-dark-border p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm disabled:opacity-50"
                placeholder="Type a message..."
              />
              <button
                onClick={sendMessage}
                disabled={isSending || !chatInput.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Demo Tab */}
      {activeTab === 'voice' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          {voiceError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
              {voiceError}
            </div>
          )}

          <div className="space-y-6">
            {/* Voice Selector */}
            {(callStatus === 'idle' || callStatus === 'ended') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Agent Voice
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {availableVoices.map(voice => (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`px-3 py-2.5 rounded-lg border text-left transition-all duration-200 ${
                        selectedVoice === voice.id
                          ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                          : 'bg-gray-50 dark:bg-dark-hover border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-500'
                      }`}
                    >
                      <span className="block text-sm font-medium">{voice.name}</span>
                      <span className={`block text-xs mt-0.5 ${
                        selectedVoice === voice.id
                          ? 'text-primary-200'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>{voice.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Microphone Icon & Status */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                {/* Glow ring */}
                <div className={`absolute -inset-1 rounded-full transition-all duration-500 ${
                  callStatus === 'active'
                    ? 'bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                    : callStatus === 'connecting'
                    ? 'bg-yellow-500/20 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                    : 'bg-primary-500/10 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                }`} />
                {/* Volume pulse ring */}
                {callStatus === 'active' && (
                  <div
                    className="absolute -inset-3 rounded-full border border-green-400/40 animate-ping"
                    style={{ opacity: Math.min(voiceVolume * 2, 0.5), animationDuration: '1.5s' }}
                  />
                )}
                {/* Mic circle */}
                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                  callStatus === 'active'
                    ? 'bg-green-500/10 border-2 border-green-500/40'
                    : callStatus === 'connecting'
                    ? 'bg-yellow-500/10 border-2 border-yellow-500/40'
                    : 'bg-gray-100 dark:bg-dark-hover border-2 border-gray-300 dark:border-gray-600/50'
                }`}>
                  <svg className={`w-8 h-8 transition-colors duration-300 ${
                    callStatus === 'active' ? 'text-green-500'
                      : callStatus === 'connecting' ? 'text-yellow-500'
                      : 'text-gray-400 dark:text-gray-500'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
              {/* Status text */}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {callStatus === 'idle' && 'Ready to start voice call'}
                {callStatus === 'connecting' && 'Connecting...'}
                {callStatus === 'active' && 'Call active — speak into your microphone'}
                {callStatus === 'ended' && 'Call ended'}
              </span>
              {/* Timer */}
              {(callStatus === 'active' || callStatus === 'ended') && voiceElapsed > 0 && (
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                  {formatElapsed(voiceElapsed)}
                </span>
              )}
            </div>

            {/* Call Controls */}
            <div className="flex items-center justify-center gap-4">
              {callStatus === 'active' && (
                <button
                  onClick={toggleVoiceMute}
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    voiceMuted
                      ? 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20'
                      : 'bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-dark-border hover:bg-gray-200 dark:hover:bg-dark-border'
                  }`}
                  title={voiceMuted ? 'Unmute' : 'Mute'}
                >
                  {voiceMuted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              )}

              {(callStatus === 'idle' || callStatus === 'ended') ? (
                <button
                  onClick={startVoiceCall}
                  className="p-4 rounded-2xl bg-green-600 text-white hover:bg-green-500 transition-all duration-200 shadow-lg shadow-green-600/20 hover:shadow-green-500/30"
                  title="Start voice call"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </button>
              ) : callStatus === 'connecting' ? (
                <button
                  disabled
                  className="p-4 rounded-2xl bg-yellow-600/80 text-white cursor-not-allowed shadow-lg"
                >
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </button>
              ) : (
                <button
                  onClick={stopVoiceCall}
                  className="p-4 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all duration-200 shadow-lg shadow-red-600/20"
                  title="End call"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Transcript */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-bg">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Live Transcript</span>
              </div>
              <div className="h-48 overflow-y-auto p-4 space-y-2.5">
                {voiceTranscript.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                    {callStatus === 'idle' || callStatus === 'ended'
                      ? 'Select a voice and click the call button to talk to your AI agent'
                      : 'Waiting for conversation...'}
                  </p>
                ) : (
                  voiceTranscript.map((entry, i) => (
                    <div key={i} className={`text-sm ${
                      entry.role === 'Agent'
                        ? 'text-primary-600 dark:text-primary-400'
                        : entry.role === 'System'
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      <span className="font-medium">{entry.role}:</span> {entry.text}
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Book Call CTA — shown below both tabs */}
      {renderBookCallCTA()}
    </div>
  )

  // ─── CALENDLY ───
  const renderCalendly = () => {
    if (!showCalendly) return null

    const calendlyUrlWithParams = darkMode
      ? `${CALENDLY_URL}?background_color=22242a&text_color=ffffff&primary_color=636c7a`
      : CALENDLY_URL

    return (
      <section ref={calendlySectionRef} className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Book Your Free Call
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-xl mx-auto">
            Schedule a 30-minute call with our team. We'll walk you through deploying your AI agent and answer any questions.
          </p>
          <div
            className="calendly-inline-widget"
            data-url={calendlyUrlWithParams}
            style={{ minWidth: '320px', height: '700px' }}
          />
        </div>
      </section>
    )
  }

  // ─── FOOTER ───
  const renderFooter = () => (
    <footer className="border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {branding.companyLogo ? (
            <img src={branding.companyLogo} alt={branding.companyName || 'Logo'} className="h-6 w-6 rounded-md object-contain bg-white dark:bg-dark-hover" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3 9l9 13 9-13-9-7z" fill="white" opacity="0.9"/>
                <path d="M12 2L3 9h18L12 2z" fill="white"/>
              </svg>
            </div>
          )}
          <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
            {branding.companyName || 'Sword AI'}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <a href="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Terms</a>
          <a href="/login" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Sign In</a>
        </div>
        <span className="text-sm text-gray-400 dark:text-gray-500">
          &copy; {new Date().getFullYear()} {branding.companyName || 'Sword AI'}. All rights reserved.
        </span>
      </div>
    </footer>
  )

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-dark-bg' : 'bg-gray-50'}`}>
      {renderNavbar()}
      {renderHero()}
      {renderFeatures()}

      {/* Demo Section */}
      <section ref={demoSectionRef} className="py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              Try Your AI Agent
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Fill out the form below and we'll generate a live chatbot demo and a voice agent for your business.
            </p>
          </div>
          {phase === 'form' && renderForm()}
          {phase === 'loading' && renderLoading()}
          {phase === 'results' && renderResults()}
        </div>
      </section>

      {renderCalendly()}
      {renderFooter()}
    </div>
  )
}
