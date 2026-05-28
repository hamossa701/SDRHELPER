import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, Badge, ScoreBadge } from '@/components/ui'
import {
  getInterestBg, getInterestLabel, getRiskBg, getRiskLabel,
  getScoreBg, formatDate
} from '@/lib/utils'
import { CorrectionForm } from '@/components/calls/CorrectionForm'

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: call } = await supabase
    .from('calls')
    .select('*, call_analyses(*), users!calls_sdr_id_fkey(name), campaigns(campaign_name, client_name, offer_description)')
    .eq('id', id)
    .single()

  if (!call) notFound()

  const a = call.call_analyses
  const canValidate = ['owner', 'manager'].includes(profile.role)
  // SDR only sees own calls (RLS enforces this at DB level too)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => history.back()} className="text-xs text-gray-400 hover:text-gray-600 mb-3 block">← Retour</button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {a?.prospect_company || 'Prospect non identifié'}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {call.campaigns?.campaign_name} · {call.users?.name} · {formatDate(call.call_datetime)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {a?.human_validated && (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Validé</Badge>
            )}
            {a?.hallucination_risk && (
              <Badge className={getRiskBg(a.hallucination_risk)}>
                IA : {getRiskLabel(a.hallucination_risk)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {!a ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-400">
            Cet appel n&apos;a pas encore été analysé.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Score overview */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Qualité RDV</p>
              <div className="flex justify-center mb-1"><ScoreBadge score={a.appointment_quality_score} /></div>
              <p className="text-xs text-gray-400 mt-1">{a.appointment_quality_reason}</p>
            </Card>
            <Card className="p-5 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Score SDR</p>
              <div className="flex justify-center"><ScoreBadge score={a.sdr_quality_score} /></div>
            </Card>
            <Card className="p-5 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Qualification</p>
              <div className="flex justify-center"><ScoreBadge score={a.qualification_completeness_score} /></div>
            </Card>
          </div>

          {/* Summary */}
          {a.call_summary && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Résumé de l&apos;appel</h3></CardHeader>
              <CardContent><p className="text-sm text-gray-700">{a.call_summary}</p></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Prospect */}
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Prospect</h3></CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Entreprise</dt>
                    <dd className="font-medium text-gray-800">{a.prospect_company || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Contact</dt>
                    <dd className="font-medium text-gray-800">{a.contact_name || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Fonction</dt>
                    <dd className="font-medium text-gray-800">{a.contact_role || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Décideur</dt>
                    <dd>
                      {a.decision_maker_detected === true
                        ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ Confirmé</Badge>
                        : a.decision_maker_detected === false
                        ? <Badge className="bg-red-50 text-red-700 border-red-200">Non confirmé</Badge>
                        : <span className="text-gray-400">—</span>
                      }
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Qualification */}
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Qualification</h3></CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between items-start">
                    <dt className="text-gray-400">Intérêt</dt>
                    <Badge className={getInterestBg(a.interest_level)}>
                      {getInterestLabel(a.interest_level)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Besoin</dt>
                    <dd className="font-medium text-gray-800">{a.pain_point_detected ? '✓ Identifié' : '—'}</dd>
                  </div>
                  {a.pain_point_details && (
                    <div>
                      <dt className="text-gray-400 mb-0.5">Détail</dt>
                      <dd className="text-gray-700 text-xs">{a.pain_point_details}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Urgence</dt>
                    <dd className="font-medium text-gray-800">{a.urgency || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Solution actuelle</dt>
                    <dd className="font-medium text-gray-800">{a.current_solution || '—'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Objection */}
          {a.objection_detected && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Objection détectée</h3>
                  {a.objection_type && <Badge className="bg-red-50 text-red-600 border-red-200">{a.objection_type}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">{a.objection_details || '—'}</p>
              </CardContent>
            </Card>
          )}

          {/* Appointment */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Rendez-vous</h3>
                {a.appointment_booked
                  ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-sm">✓ RDV posé</Badge>
                  : <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-sm">Pas de RDV</Badge>
                }
              </div>
            </CardHeader>
            {a.appointment_booked && (
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {a.appointment_datetime && (
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Date RDV</dt>
                      <dd className="font-medium text-gray-800">{formatDate(a.appointment_datetime)}</dd>
                    </div>
                  )}
                  {a.next_step && (
                    <div>
                      <dt className="text-gray-400 mb-0.5">Prochaine étape</dt>
                      <dd className="text-gray-700">{a.next_step}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            )}
          </Card>

          {/* Missing information */}
          {a.missing_information?.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">⚠️ Informations manquantes</h3></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {a.missing_information.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-amber-700 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* SDR Coaching - only for owner/manager */}
          {canValidate && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-gray-900">✅ Points forts SDR</h3></CardHeader>
                <CardContent>
                  {a.strengths?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {a.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-gray-400">—</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-gray-900">⚠️ Axes d&apos;amélioration</h3></CardHeader>
                <CardContent>
                  {a.weaknesses?.length > 0 ? (
                    <ul className="space-y-1.5">
                      {a.weaknesses.map((w: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                          <span className="text-amber-500 mt-0.5">−</span>{w}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-gray-400">—</p>}
                </CardContent>
              </Card>

              {a.coaching_recommendations?.length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader><h3 className="text-sm font-semibold text-gray-900">🎯 Recommandations coaching</h3></CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {a.coaching_recommendations.map((r: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                          <span className="text-blue-500 mt-0.5">→</span>{r}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* AI Risk */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Indicateurs IA</h3>
                <Badge className={getRiskBg(a.hallucination_risk)}>
                  Risque : {getRiskLabel(a.hallucination_risk)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm mb-3">
                <div>
                  <span className="text-gray-400">Confiance IA :</span>
                  <span className="ml-2 font-medium text-gray-800">{a.ai_confidence}%</span>
                </div>
              </div>
              {a.uncertain_fields?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Champs incertains :</p>
                  <div className="flex flex-wrap gap-1">
                    {a.uncertain_fields.map((f: string, i: number) => (
                      <Badge key={i} className="bg-amber-50 text-amber-600 border-amber-200 text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transcript */}
          {call.transcript && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">Transcription</h3></CardHeader>
              <CardContent>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
                  {call.transcript}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Manager correction mode */}
          {canValidate && (
            <CorrectionForm
              analysisId={a.id}
              humanValidated={a.human_validated}
              correctionNotes={a.correction_notes}
            />
          )}
        </div>
      )}
    </div>
  )
}
