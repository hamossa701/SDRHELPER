'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button, Card, CardContent, CardHeader } from '@/components/ui'

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    client_name: '',
    campaign_name: '',
    sector: '',
    target_persona: '',
    offer_description: '',
    script_notes: '',
    status: 'active' as const,
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()
    if (!profile) { setError('Erreur de profil'); setLoading(false); return }

    const { data, error: err } = await supabase
      .from('campaigns')
      .insert({ ...form, organization_id: profile.organization_id })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/campaigns/${data.id}`)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 mb-3 block">← Retour</button>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle campagne</h1>
        <p className="text-gray-500 text-sm mt-1">Configurez votre campagne de prise de rendez-vous</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Informations principales</h2></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom client *</label>
                <input
                  required
                  value={form.client_name}
                  onChange={e => update('client_name', e.target.value)}
                  placeholder="ex: TechSolutions France"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de campagne *</label>
                <input
                  required
                  value={form.campaign_name}
                  onChange={e => update('campaign_name', e.target.value)}
                  placeholder="ex: Prospection DSI Île-de-France"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Secteur</label>
                <input
                  value={form.sector}
                  onChange={e => update('sector', e.target.value)}
                  placeholder="ex: Logiciels B2B / SaaS"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
                <select
                  value={form.status}
                  onChange={e => update('status', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="active">Active</option>
                  <option value="paused">En pause</option>
                  <option value="completed">Terminée</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><h2 className="text-sm font-semibold text-gray-900">Contexte de vente</h2></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Persona cible</label>
              <input
                value={form.target_persona}
                onChange={e => update('target_persona', e.target.value)}
                placeholder="ex: DSI ou DG dans PME 50-500 salariés"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description de l&apos;offre</label>
              <textarea
                rows={3}
                value={form.offer_description}
                onChange={e => update('offer_description', e.target.value)}
                placeholder="Décrivez l'offre : bénéfices clés, différenciateurs..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes de script</label>
              <textarea
                rows={3}
                value={form.script_notes}
                onChange={e => update('script_notes', e.target.value)}
                placeholder="Consignes pour les SDRs, points à qualifier, objections courantes..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer la campagne</Button>
        </div>
      </form>
    </div>
  )
}
