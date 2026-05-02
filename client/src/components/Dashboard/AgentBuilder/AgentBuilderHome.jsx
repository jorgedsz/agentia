import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import AgentBuilderWizard from './AgentBuilderWizard'
import { agentsAPI, chatbotsAPI, voicesAPI, trainingAPI } from '../../../services/api'
import { useAuth } from '../../../context/AuthContext'
import { useLanguage } from '../../../context/LanguageContext'
import AgentBuilderShell from './AgentBuilderShell'
import BehaviorPreviewCard from './home/BehaviorPreviewCard'
import WizardAnswersCard from './home/WizardAnswersCard'
import TrainingHistoryCard from './home/TrainingHistoryCard'
import TrainingCallModal from '../TrainingCallModal'
import TestChatbotModal from '../TestChatbotModal'

const parseConfig = (raw) => {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return {} }
}

export default function AgentBuilderHome({ type }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()

  const [searchParams] = useSearchParams()
  if (searchParams.get('mode') === 'regenerate') {
    return <AgentBuilderWizard type={type} />
  }

  const [agent, setAgent] = useState(null)
  const [config, setConfig] = useState({})
  const [voices, setVoices] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCallModal, setShowCallModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)

  // Feature flag guard
  useEffect(() => {
    if (user && !user.agentGeneratorEnabled) {
      navigate(type === 'voice' ? '/dashboard/agents' : '/dashboard/chatbots', { replace: true })
    }
  }, [user, type, navigate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const api = type === 'voice' ? agentsAPI : chatbotsAPI
      const [agentRes, voicesRes] = await Promise.all([
        api.get(id),
        voicesAPI.list().catch(() => ({ data: [] })),
      ])
      const a = agentRes.data.agent || agentRes.data.chatbot
      setAgent(a)
      setConfig(parseConfig(a?.config))
      setVoices(voicesRes.data || [])
      if (type === 'voice') {
        const s = await trainingAPI.listSessions(id).catch(() => ({ data: [] }))
        setSessions(s.data || [])
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id, type])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) {
    return (
      <AgentBuilderShell type={type} agentId={id}>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </AgentBuilderShell>
    )
  }

  return (
    <AgentBuilderShell type={type} agentId={id} agentName={agent?.name}>
      <div className="max-w-3xl mx-auto space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}

        {/* Primary action */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-primary-300 dark:border-primary-600/40 p-6">
          {type === 'voice' ? (
            <button
              onClick={() => setShowCallModal(true)}
              className="w-full px-4 py-3 text-base font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-500"
            >
              {t('agentBuilder.homeEditViaCall')}
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowChatModal(true)}
                className="w-full px-4 py-3 text-base font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-500"
              >
                {t('agentBuilder.homeTestChat')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('agentBuilder.homeChatTrainingComingSoon')}
              </p>
            </>
          )}
        </div>

        <BehaviorPreviewCard config={config} voices={voices} type={type} t={t} />
        <WizardAnswersCard
          wizardAnswers={config.wizardAnswers}
          type={type}
          agentId={id}
          t={t}
        />
        {type === 'voice' && (
          <TrainingHistoryCard sessions={sessions} t={t} />
        )}
      </div>

      {showCallModal && type === 'voice' && agent && (
        <TrainingCallModal
          agent={agent}
          onClose={() => setShowCallModal(false)}
          onAccepted={() => { setShowCallModal(false); fetchAll() }}
        />
      )}
      {showChatModal && type === 'chat' && agent && (
        <TestChatbotModal
          chatbot={agent}
          onClose={() => setShowChatModal(false)}
        />
      )}
    </AgentBuilderShell>
  )
}
