'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export function CorrectionForm({ analysisId, humanValidated, correctionNotes }: { analysisId: string; humanValidated: boolean; correctionNotes: string | null }) {
  const [notes, setNotes] = useState(correctionNotes || '')
  const [validated, setValidated] = useState(humanValidated)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await createClient().from('call_analyses').update({ human_validated: validated, correction_notes: notes || null }).eq('id', analysisId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase' }}>Validation superviseur</div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes de correction ou commentaires sur l'analyse IA..."
          style={{ width: '100%', padding: '9px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', resize: 'none' }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
            <input type="checkbox" checked={validated} onChange={e => setValidated(e.target.checked)} style={{ width: 14, height: 14 }} />
            Marquer comme validé
          </label>
          <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', background: saved ? 'rgba(34,197,94,.8)' : 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', fontFamily: 'Geist, sans-serif' }}>
            {saving ? 'Sauvegarde...' : saved ? 'Sauvegarde' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
