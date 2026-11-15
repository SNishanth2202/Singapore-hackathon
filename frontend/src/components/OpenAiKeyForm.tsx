import { FormEvent, useState } from 'react'
import { KeyIcon, Loader2Icon } from 'lucide-react'
import { rankingRequest } from '../services/ranking.service'

export function OpenAiKeyForm({ configured, onConnected }: { configured: boolean; onConnected: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await rankingRequest('/llm/session', { apiKey: apiKey.trim() })
      setApiKey('')
      await onConnected()
    } catch (error) { setApiKey(''); setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <form className="lr-key-form" onSubmit={event => void submit(event)}>
    <div className="lr-key-icon"><KeyIcon size={24} /></div>
    <h3>{configured ? 'Use your own OpenAI key' : 'Connect OpenAI to rank leads'}</h3>
    <p>OpenAI assesses the supplied CRM facts and public evidence, then chooses each lead’s urgency and confidence.</p>
    {configured && <p className="lr-key-configured">A key is already configured for this session or machine. Entering a key here applies only to your browser session.</p>}
    <label htmlFor="ranking-openai-key">OpenAI API key</label>
    <input id="ranking-openai-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
      placeholder="sk-…" required minLength={20} value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={busy} />
    <p className="lr-key-privacy">Your key is sent to this app’s backend and kept in memory for this session. It is never saved in browser storage or returned by the API. OpenAI API usage is billed to your account.</p>
    {error && <p className="lr-key-error" role="alert">{error}</p>}
    <button className="lr-button primary" type="submit" disabled={busy || !apiKey.trim()}>{busy ? <><Loader2Icon size={16} className="lr-spin" />Connecting and assessing leads…</> : 'Connect and assess leads'}</button>
    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an OpenAI API key</a>
  </form>
}
