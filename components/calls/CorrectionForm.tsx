'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui'

interface Props {
  analysisId: string
  humanValidated: boolean
  correctionNotes: string | null
}

export function CorrectionForm({ analysisId, humanValidated, correctionNotes }: Props) {
  const [notes, setNotes] = useState(correctionNotes || '')
  const [validated, setValidated] = useState(humanValidated)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('call_analyses')
      .update({
        human_validated: validated,
        correction_notes: notes || null,
      })
      .eq('id', analysisId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Validation superviseur</h3>
          {validated && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Validé</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes de correction</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ajoutez vos corrections ou commentaires sur l'analyse IA..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={validated}
              onChange={e => setValidated(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-slate-800 focus:ring-slate-500"
            />
            <span className="text-sm text-gray-700">Marquer comme validé</span>
          </label>

          <Button onClick={handleSave} loading={saving} size="sm">
            {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
