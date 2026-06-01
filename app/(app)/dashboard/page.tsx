import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { StatCard, Badge, ScoreBadge } from '@/components/ui'
import { getCampaignStatusBg, getCampaignStatusLabel, formatDateShort } from '@/lib/utils'
import { isQualifiedAppointment } from '@/lib/review-flags'
import { formatProspectDisplay } from '@/lib/dashboard-visibility'
import Link from 'next/link'
import type { Campaign, DashboardKPIs, SDRLeaderboardRow, DashboardCampaignStatsRow, CampaignHealthResult } from '@/types'

function campaignHealthFromStats(s: DashboardCampaignStatsRow): CampaignHealthResult {
  if (s.total_calls === 0) {
    return { score: 0, label: 'Pas de données', labelClass: 'text-slate-400', labelBg: 'bg-slate-800 text-slate-400 border-slate-600' }
  }
  const qualRate = s.appointments_booked > 0 ? s.qualified_appointments / s.appointments_booked : 0
  const score = Math.round(
    0.40 * (s.avg_appointment_quality ?? 0) +
    0.25 * (s.avg_sdr_quality ?? 0) +
    0.20 * (qualRate * 100) +
    0.15 * (s.avg_ai_confidence ?? 0)
  )
  if (score >= 80) return { score, label: 'Très saine',   labelClass: 'text-emerald-400', labelBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
  if (score >= 65) return { score, label: 'Correcte',     labelClass: 'text-blue-400',    labelBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
  if (score >= 50) return { score, label: 'À surveiller', labelClass: 'text-amber-400',   labelBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
  return { score, label: 'Critique', labelClass: 'text-red-400', labelBg: 'bg-red-500/10 text-red-400 border-red-500/30' }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: { name: string; value: string; options: object }[]) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/login')

  const { data: campaigns } = await supabase
    .from('campaigns').select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const campaignIds = (campaigns || []).map((c: Campaign) => c.id)

  const [
    { data: kpisData },
    { data: leaderboardData },
    { data: campaignStatsData },
    { data: recentCalls },
  ] = await Promise.all([
    supabase.rpc('get_dashboard_kpis', { p_org_id: profile.organization_id }),
    supabase.rpc('get_sdr_leaderboard', { p_org_id: profile.organization_id }),
    campaignIds.length > 0
      ? supabase.rpc('get_dashboard_campaign_stats', { p_campaign_ids: campaignIds, p_org_id: profile.organization_id })
      : Promise.resolve({ data: [] as DashboardCampaignStatsRow[] }),
    supabase
      .from('calls')
      .select('id, call_datetime, call_analyses!inner(appointment_booked, appointment_date_text, appointment_datetime, appointment_date_confidence, appointment_quality_score, sdr_quality_score, prospect_company, contact_name, decision_maker_detected, pain_point_detected), analysis_jobs!inner(status), users!calls_sdr_id_fkey(name)')
      .eq('organization_id', profile.organization_id)
      .eq('analysis_jobs.status', 'completed')
      .order('call_datetime', { ascending: false })
      .limit(10),
  ])

  const kpis: DashboardKPIs = kpisData?.[0] ?? {
    total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null,
    active_campaigns: 0, sdrs_needing_coaching: 0, team_trend: 'stable',
  }

  const sdrStats = (leaderboardData || []) as SDRLeaderboardRow[]
  const bestSdr = sdrStats[0] ?? null
  const weakestSdr = sdrStats[sdrStats.length - 1] ?? null

  const teamTrendLabel = kpis.team_trend === 'improving' ? '↑ En progression'
    : kpis.team_trend === 'declining' ? '↓ En régression' : '→ Stable'
  const teamTrendColor = kpis.team_trend === 'improving' ? '#86efac'
    : kpis.team_trend === 'declining' ? '#fca5a5' : 'var(--cyan)'

  const statsMap = Object.fromEntries(
    ((campaignStatsData || []) as DashboardCampaignStatsRow[]).map(s => [s.campaign_id, s])
  )
  const emptyStat = (id: string): DashboardCampaignStatsRow => ({
    campaign_id: id, total_calls: 0, appointments_booked: 0, qualified_appointments: 0,
    avg_appointment_quality: null, avg_sdr_quality: null, avg_ai_confidence: null,
  })
  const campaignStats = (campaigns || []).map((c: Campaign) => ({
    ...c,
    totalCalls: statsMap[c.id]?.total_calls ?? 0,
    rdvBooked: statsMap[c.id]?.appointments_booked ?? 0,
    health: campaignHealthFromStats(statsMap[c.id] ?? emptyStat(c.id)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Vue d&apos;ensemble</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Supervision globale de votre activité</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: teamTrendColor }}>{teamTrendLabel}</span>
      </div>

      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div className="app-kpi-grid">
          <StatCard label="Appels analysés"  value={kpis.total_calls} />
          <StatCard label="RDV posés"         value={kpis.appointments_booked} />
          <StatCard label="RDV qualifiés"     value={kpis.qualified_appointments} sub="décideur + besoin + date + score ≥60" />
          <StatCard label="Qualité RDV moy."  value={kpis.avg_appointment_quality ?? '—'} sub="/100" />
          <StatCard label="Score SDR moy."    value={kpis.avg_sdr_quality ?? '—'} sub="/100" />
          <StatCard label="Campagnes actives" value={kpis.active_campaigns} />
        </div>

        <div className="dashboard-main-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Santé des campagnes</span>
              <Link href="/campaigns" style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                Voir tout <span className="mat" style={{ fontSize: 13 }}>arrow_forward</span>
              </Link>
            </div>
            <div>
              {campaignStats.length === 0 && (
                <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucune campagne</div>
              )}
              {campaignStats.map((c, i) => (
                <Link key={c.id} href={`/campaigns/${c.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: i < campaignStats.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.campaign_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{c.client_name}<span style={{ margin: '0 5px' }}>·</span>{c.totalCalls} appel{c.totalCalls !== 1 ? 's' : ''}<span style={{ margin: '0 5px' }}>·</span>{c.rdvBooked} RDV</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16, flexShrink: 0 }}>
                    {c.totalCalls > 0 && <Badge className={c.health.labelBg}>{c.health.label} · {c.health.score}</Badge>}
                    <Badge className={getCampaignStatusBg(c.status)}>{getCampaignStatusLabel(c.status)}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Classement SDR</span>
            </div>
            <div>
              {sdrStats.length === 0 && (
                <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucun SDR</div>
              )}
              {sdrStats.map((sdr, i) => (
                <div key={sdr.sdr_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: i < sdrStats.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 18, textAlign: 'center', flexShrink: 0, color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : 'var(--muted-2)' }}>{i + 1}</span>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--indigo),var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{sdr.sdr_name.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sdr.sdr_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{sdr.total_calls} appels · {sdr.rdv_booked} RDV</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: (sdr.avg_sdr_quality ?? 0) >= 70 ? '#86efac' : (sdr.avg_sdr_quality ?? 0) >= 50 ? '#fcd34d' : '#fca5a5' }}>{sdr.avg_sdr_quality ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {sdrStats.length > 0 && (
          <div className="dashboard-highlight-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', padding: '16px 18px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(34,197,94,.7)', borderRadius: '12px 0 0 12px' }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Meilleur SDR</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bestSdr?.sdr_name || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Score moy. <span style={{ color: '#86efac', fontWeight: 600 }}>{bestSdr?.avg_sdr_quality ?? '—'}</span></div>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', padding: '16px 18px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(239,68,68,.7)', borderRadius: '12px 0 0 12px' }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>SDR à coacher</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{weakestSdr?.sdr_name || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Score moy. <span style={{ color: '#fca5a5', fontWeight: 600 }}>{weakestSdr?.avg_sdr_quality ?? '—'}</span></div>
            </div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)', padding: '16px 18px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(245,158,11,.7)', borderRadius: '12px 0 0 12px' }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Charge coaching</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>{kpis.sdrs_needing_coaching}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>SDR nécessitant coaching</span>
                <Link href="/coaching" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 600 }}>Voir →</Link>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Appels récents</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>SDR</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Prospect</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>RDV</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Qualité RDV</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Score SDR</th>
                </tr>
              </thead>
              <tbody>
                {(recentCalls || []).map((call) => {
                  const analysis = one(call.call_analyses)
                  const sdr = one(call.users)
                  return (
                    <tr key={call.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 18px', color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>{formatDateShort(call.call_datetime)}</td>
                      <td style={{ padding: '11px 18px', fontWeight: 600, color: 'var(--text)' }}>{sdr?.name || '—'}</td>
                      <td style={{ padding: '11px 18px', color: 'var(--muted)' }}>{formatProspectDisplay(analysis)}</td>
                      <td style={{ padding: '11px 18px' }}>
                        {analysis?.appointment_booked ? (
                          isQualifiedAppointment(analysis as Parameters<typeof isQualifiedAppointment>[0])
                            ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Qualifié</Badge>
                            : <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Posé</Badge>
                        ) : (
                          <span style={{ color: 'var(--muted-2)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        <Link href={`/calls/${call.id}`}><ScoreBadge score={analysis?.appointment_quality_score ?? null} /></Link>
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        <ScoreBadge score={analysis?.sdr_quality_score ?? null} />
                      </td>
                    </tr>
                  )
                })}
                {!recentCalls?.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucun appel analysé pour l&apos;instant</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
