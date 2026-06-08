'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, CardHeader, DarkSelect, ScoreBadge, StatCard } from '@/components/ui'
import { formatDateShort, getCampaignStatusBg, getCampaignStatusLabel, getScoreColor } from '@/lib/utils'
import { formatProspectDisplay } from '@/lib/dashboard-visibility'
import { isQualifiedAppointment } from '@/lib/review-flags'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'
import type {
  CallAnalysis,
  Campaign,
  CampaignHealthResult,
  CampaignStatus,
  DashboardKPIs,
  ReviewStatus,
  SDRLeaderboardRow,
} from '@/types'

type Joined<T> = T | T[] | null
type RvvStatus = 'all' | 'booked' | 'qualified' | 'none'
type DateRange = 'all' | '7d' | '30d' | '90d'
type QualityFilter = 'all' | 'high' | 'medium' | 'low' | 'missing'
type SortMode = 'newest' | 'quality'
type KpiFilter = 'all' | 'booked' | 'qualified' | 'quality' | 'pending_review' | null

type OwnerDashboardAnalysis = Pick<
  CallAnalysis,
  | 'appointment_booked'
  | 'appointment_date_text'
  | 'appointment_datetime'
  | 'appointment_date_confidence'
  | 'appointment_quality_score'
  | 'sdr_quality_score'
  | 'prospect_company'
  | 'contact_name'
  | 'decision_maker_detected'
  | 'pain_point_detected'
  | 'ai_confidence'
  | 'human_validated'
>

export type OwnerDashboardCall = {
  id: string
  call_datetime: string
  review_status: ReviewStatus | null
  call_analyses: Joined<OwnerDashboardAnalysis>
  users: Joined<{ name: string | null }>
  campaigns: Joined<{ campaign_name: string | null; client_name: string | null; status: CampaignStatus | null }>
}

export type OwnerDashboardCampaign = Campaign & {
  totalCalls: number
  rdvBooked: number
  health: CampaignHealthResult
}

type Props = {
  kpis: DashboardKPIs
  campaigns: OwnerDashboardCampaign[]
  historyCalls: OwnerDashboardCall[]
  teamTrendLabel: string
  teamTrendColor: string
  sdrStats: SDRLeaderboardRow[]
}

function one<T>(value: Joined<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function statusRank(status: CampaignStatus) {
  if (status === 'active') return 0
  if (status === 'paused') return 1
  if (status === 'completed') return 2
  return 3
}

function reviewLabel(status: ReviewStatus | null, humanValidated: boolean | null | undefined) {
  if (humanValidated) return 'Validée'
  if (status === 'resolved') return 'Résolue'
  if (status === 'in_review') return 'En revue'
  return 'Ouverte'
}

function reviewBadgeClass(status: ReviewStatus | null, humanValidated: boolean | null | undefined) {
  if (humanValidated || status === 'resolved') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  if (status === 'in_review') return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  return 'bg-slate-800 text-slate-400 border-slate-600'
}

function isQualified(analysis: OwnerDashboardAnalysis | null) {
  return !!analysis && isQualifiedAppointment(analysis as CallAnalysis)
}

function rdvStatus(analysis: OwnerDashboardAnalysis | null): RvvStatus {
  if (!analysis?.appointment_booked) return 'none'
  return isQualified(analysis) ? 'qualified' : 'booked'
}

function rdvStatusNode(analysis: OwnerDashboardAnalysis | null) {
  const status = rdvStatus(analysis)
  if (status === 'qualified') return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">RDV qualifié</Badge>
  if (status === 'booked') return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">RDV posé</Badge>
  return <Badge className="bg-slate-800 text-slate-400 border-slate-600">Aucun RDV</Badge>
}

function qualityMatches(score: number | null | undefined, filter: QualityFilter) {
  if (filter === 'all') return true
  if (filter === 'missing') return score === null || score === undefined
  if (score === null || score === undefined) return false
  if (filter === 'high') return score >= 70
  if (filter === 'medium') return score >= 40 && score < 70
  return score < 40
}

function dateMatches(value: string, range: DateRange) {
  if (range === 'all') return true
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const date = new Date(value).getTime()
  if (Number.isNaN(date)) return false
  return Date.now() - date <= days * 86_400_000
}

function computeSimpleFlags(analysis: OwnerDashboardAnalysis | null): string[] {
  if (!analysis) return []
  const flags: string[] = []
  if (analysis.appointment_booked && !analysis.decision_maker_detected) flags.push('Décideur non confirmé')
  if (analysis.appointment_booked && analysis.appointment_quality_score !== null && analysis.appointment_quality_score < 60) flags.push('Score RDV faible')
  if (analysis.appointment_booked && !analysis.pain_point_detected) flags.push('Qualification incomplète')
  if (analysis.ai_confidence !== null && analysis.ai_confidence < 70) flags.push('Confiance IA basse')
  return flags
}

export function OwnerDashboardClient({
  kpis,
  campaigns,
  historyCalls,
  teamTrendLabel,
  teamTrendColor,
  sdrStats,
}: Props) {
  const [selectedKpi, setSelectedKpi] = useState<KpiFilter>(null)
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [sdrFilter, setSdrFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<RvvStatus>('all')
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [visibleCount, setVisibleCount] = useState(12)

  const atRiskCampaigns = useMemo(
    () => campaigns.filter(c => c.health.score > 0 && c.health.score < 50).length,
    [campaigns]
  )

  const pendingReviewCount = useMemo(
    () => historyCalls.filter(call => {
      const a = one(call.call_analyses)
      return !a?.human_validated && (call.review_status === 'open' || call.review_status === 'in_review')
    }).length,
    [historyCalls]
  )

  const activeClientsCount = useMemo(
    () => new Set(campaigns.filter(c => c.status === 'active').map(c => c.client_name).filter(Boolean)).size,
    [campaigns]
  )

  const validationNeeded = useMemo(() => {
    return historyCalls
      .filter(call => {
        const a = one(call.call_analyses)
        return !a?.human_validated && (call.review_status === 'open' || call.review_status === 'in_review')
      })
      .map(call => ({ call, flags: computeSimpleFlags(one(call.call_analyses)) }))
      .filter(({ flags }) => flags.length > 0)
      .sort((a, b) => b.flags.length - a.flags.length)
      .slice(0, 5)
  }, [historyCalls])

  const orderedCampaigns = useMemo(() => {
    return [...campaigns]
      .sort((a, b) => {
        if (a.health.score === 0 && b.health.score === 0) return statusRank(a.status) - statusRank(b.status)
        if (a.health.score === 0) return 1
        if (b.health.score === 0) return -1
        if (a.health.score !== b.health.score) return a.health.score - b.health.score
        return statusRank(a.status) - statusRank(b.status)
      })
      .slice(0, 3)
  }, [campaigns])

  const filterOptions = useMemo(() => {
    const sdrs = new Set<string>()
    const campaignNames = new Set<string>()
    for (const call of historyCalls) {
      const sdr = one(call.users)
      const campaign = one(call.campaigns)
      if (sdr?.name) sdrs.add(sdr.name)
      if (campaign?.campaign_name) campaignNames.add(campaign.campaign_name)
    }
    return {
      sdrs: [...sdrs].sort((a, b) => a.localeCompare(b, 'fr')),
      campaigns: [...campaignNames].sort((a, b) => a.localeCompare(b, 'fr')),
    }
  }, [historyCalls])

  const filteredCalls = useMemo(() => {
    const rows = historyCalls.filter((call) => {
      const analysis = one(call.call_analyses)
      const sdr = one(call.users)
      const campaign = one(call.campaigns)

      if (selectedKpi === 'pending_review') {
        if (analysis?.human_validated || (call.review_status !== 'open' && call.review_status !== 'in_review')) return false
      }

      const status = rdvStatus(analysis)
      const effectiveStatusMatch =
        statusFilter === 'all' ? true :
        statusFilter === 'booked' ? analysis?.appointment_booked === true :
        status === statusFilter

      return dateMatches(call.call_datetime, dateRange)
        && (sdrFilter === 'all' || sdr?.name === sdrFilter)
        && (campaignFilter === 'all' || campaign?.campaign_name === campaignFilter)
        && effectiveStatusMatch
        && qualityMatches(analysis?.appointment_quality_score, qualityFilter)
    })

    return rows.sort((a, b) => {
      if (sortMode === 'quality') {
        const aq = one(a.call_analyses)?.appointment_quality_score ?? -1
        const bq = one(b.call_analyses)?.appointment_quality_score ?? -1
        return bq - aq || new Date(b.call_datetime).getTime() - new Date(a.call_datetime).getTime()
      }
      return new Date(b.call_datetime).getTime() - new Date(a.call_datetime).getTime()
    })
  }, [selectedKpi, campaignFilter, dateRange, historyCalls, qualityFilter, sdrFilter, sortMode, statusFilter])

  const visibleCalls = filteredCalls.slice(0, visibleCount)
  const selectStyle = { minHeight: 34, fontSize: 12, width: 'auto', minWidth: 126 }

  const applyKpiFilter = (next: Exclude<KpiFilter, null>) => {
    setSelectedKpi((current) => current === next ? null : next)
    setVisibleCount(12)
    if (selectedKpi === next) {
      setStatusFilter('all')
      setSortMode('newest')
      setQualityFilter('all')
      return
    }
    if (next === 'all') { setStatusFilter('all'); setSortMode('newest'); setQualityFilter('all') }
    if (next === 'booked') setStatusFilter('booked')
    if (next === 'qualified') setStatusFilter('qualified')
    if (next === 'quality') { setSortMode('quality'); setQualityFilter('all') }
  }

  const updateFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value)
    setSelectedKpi(null)
    setVisibleCount(12)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Vue d&apos;ensemble</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pilotage opérationnel des analyses et campagnes</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: teamTrendColor }}>{teamTrendLabel}</span>
      </div>

      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Onboarding checklist ── */}
        <OnboardingChecklist role="owner" />

        {/* ── KPI grid — owner-oriented ── */}
        <div className="app-kpi-grid">
          <Link href="/campaigns" className="h3a-kpi-button">
            <StatCard label="Campagnes actives" value={kpis.active_campaigns} />
          </Link>
          <Link href="/campaigns" className="h3a-kpi-button">
            <StatCard
              label="Campagnes à risque"
              value={atRiskCampaigns}
              valueColor={atRiskCampaigns > 0 ? '#fca5a5' : undefined}
              variant={atRiskCampaigns > 0 ? 'danger' : 'default'}
            />
          </Link>
          <button className="h3a-kpi-button" type="button" onClick={() => applyKpiFilter('qualified')} aria-pressed={selectedKpi === 'qualified'}>
            <StatCard label="RDV qualifiés" value={kpis.qualified_appointments} sub="Décideur + besoin + date" className={selectedKpi === 'qualified' ? 'is-active' : undefined} variant="success" />
          </button>
          <button className="h3a-kpi-button" type="button" onClick={() => applyKpiFilter('pending_review')} aria-pressed={selectedKpi === 'pending_review'}>
            <StatCard
              label="En attente de revue"
              value={pendingReviewCount}
              valueColor={pendingReviewCount > 0 ? '#fcd34d' : undefined}
              className={selectedKpi === 'pending_review' ? 'is-active' : undefined}
              variant={pendingReviewCount > 0 ? 'warning' : 'default'}
            />
          </button>
          <StatCard label="Clients actifs" value={activeClientsCount} />
          <Link href="/coaching" className="h3a-kpi-button">
            <StatCard
              label="SDR coaching requis"
              value={kpis.sdrs_needing_coaching}
              valueColor={kpis.sdrs_needing_coaching > 0 ? '#fcd34d' : undefined}
            />
          </Link>
        </div>

        {/* ── Main content grid ── */}
        <div className="owner-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Analyses nécessitant validation */}
            {validationNeeded.length > 0 && (
              <div style={{
                border: '1px solid rgba(245,158,11,.35)',
                borderLeft: '3px solid rgba(245,158,11,.8)',
                background: 'rgba(245,158,11,.06)',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(245,158,11,.18)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mat" style={{ fontSize: 16, color: '#fcd34d' }}>warning</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d' }}>
                      Action requise
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '1px 7px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(245,158,11,.18)',
                      color: '#fcd34d',
                      border: '1px solid rgba(245,158,11,.35)',
                    }}>
                      {validationNeeded.length} analyse{validationNeeded.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(253,211,77,.6)', fontWeight: 600 }}>
                    Analyses nécessitant validation
                  </span>
                </div>
                <div>
                  {validationNeeded.map(({ call, flags }, index) => {
                    const analysis = one(call.call_analyses)
                    const sdr = one(call.users)
                    const campaign = one(call.campaigns)
                    return (
                      <div key={call.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 18px', borderBottom: index < validationNeeded.length - 1 ? '1px solid var(--border)' : 'none', borderLeft: '2px solid rgba(239,68,68,.45)' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatProspectDisplay(analysis)}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{sdr?.name || '—'} · {campaign?.campaign_name || '—'}</span>
                          </div>
                          <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {flags.map((flag, i) => (
                              <span key={i} style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,.09)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.25)' }}>
                                {flag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <ScoreBadge score={analysis?.appointment_quality_score ?? null} />
                          <Link href={`/calls/${call.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--cyan)', whiteSpace: 'nowrap' }}>Examiner</Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Analysis history table */}
            <Card className="owner-history-card" style={{ overflow: 'hidden', minWidth: 0 }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Historique des analyses</h2>
                    <p style={{ marginTop: 3, fontSize: 11, color: 'var(--muted-2)' }}>
                      {filteredCalls.length} analyse{filteredCalls.length > 1 ? 's' : ''} visible{filteredCalls.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <DarkSelect value={dateRange} onChange={(next) => updateFilter(setDateRange, next as DateRange)} ariaLabel="Période" style={selectStyle}
                      options={[{ value: 'all', label: 'Toutes dates' }, { value: '7d', label: '7 derniers jours' }, { value: '30d', label: '30 derniers jours' }, { value: '90d', label: '90 derniers jours' }]} />
                    <DarkSelect value={sdrFilter} onChange={(next) => updateFilter(setSdrFilter, next)} ariaLabel="SDR" style={selectStyle}
                      options={[{ value: 'all', label: 'Tous SDR' }, ...filterOptions.sdrs.map(name => ({ value: name, label: name }))]} />
                    <DarkSelect value={campaignFilter} onChange={(next) => updateFilter(setCampaignFilter, next)} ariaLabel="Campagne" style={{ ...selectStyle, minWidth: 150 }}
                      options={[{ value: 'all', label: 'Toutes campagnes' }, ...filterOptions.campaigns.map(name => ({ value: name, label: name }))]} />
                    <DarkSelect value={statusFilter} onChange={(next) => updateFilter(setStatusFilter, next as RvvStatus)} ariaLabel="Statut RDV" style={selectStyle}
                      options={[{ value: 'all', label: 'Tous RDV' }, { value: 'booked', label: 'RDV posés' }, { value: 'qualified', label: 'RDV qualifiés' }, { value: 'none', label: 'Sans RDV' }]} />
                    <DarkSelect value={qualityFilter} onChange={(next) => updateFilter(setQualityFilter, next as QualityFilter)} ariaLabel="Qualité" style={selectStyle}
                      options={[{ value: 'all', label: 'Toute qualité' }, { value: 'high', label: 'Qualité haute' }, { value: 'medium', label: 'Qualité moyenne' }, { value: 'low', label: 'Qualité basse' }, { value: 'missing', label: 'Sans score' }]} />
                    <DarkSelect value={sortMode} onChange={(next) => updateFilter(setSortMode, next as SortMode)} ariaLabel="Tri" style={selectStyle}
                      options={[{ value: 'newest', label: 'Plus récents' }, { value: 'quality', label: 'Score qualité' }]} />
                  </div>
                </div>
              </CardHeader>

              <div className="owner-history-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="owner-history-table" style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 64 }} />
                    <col style={{ width: 74 }} />
                    <col style={{ width: 102 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 62 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 76 }} />
                    <col style={{ width: 80 }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: 'var(--thead)', borderBottom: '1px solid var(--border)' }}>
                      {['Date', 'SDR', 'Campagne', 'Prospect', 'RDV', 'Qualité', 'Confiance IA', 'Revue', ''].map(header => (
                        <th key={header} style={{ padding: '10px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCalls.map((call) => {
                      const analysis = one(call.call_analyses)
                      const sdr = one(call.users)
                      const campaign = one(call.campaigns)
                      return (
                        <tr key={call.id} className="h3a-data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 10px', color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>{formatDateShort(call.call_datetime)}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sdr?.name || '—'}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign?.campaign_name || '—'}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatProspectDisplay(analysis)}</td>
                          <td style={{ padding: '12px 10px' }}>{rdvStatusNode(analysis)}</td>
                          <td style={{ padding: '12px 10px' }}><ScoreBadge score={analysis?.appointment_quality_score ?? null} /></td>
                          <td style={{ padding: '12px 10px', color: 'var(--muted)', fontWeight: 700 }}>{analysis?.ai_confidence !== null && analysis?.ai_confidence !== undefined ? `${analysis.ai_confidence}%` : '—'}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <Badge className={reviewBadgeClass(call.review_status, analysis?.human_validated)}>{reviewLabel(call.review_status, analysis?.human_validated)}</Badge>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Link href={`/calls/${call.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--cyan)' }}>Voir analyse</Link>
                          </td>
                        </tr>
                      )
                    })}
                    {visibleCalls.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--muted-2)', fontSize: 13 }}>
                          Aucune analyse trouvée pour ces filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="owner-history-mobile-list">
                  {visibleCalls.map((call) => {
                    const analysis = one(call.call_analyses)
                    const sdr = one(call.users)
                    const campaign = one(call.campaigns)
                    return (
                      <Link key={call.id} href={`/calls/${call.id}`} className="owner-history-mobile-row">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatProspectDisplay(analysis)}</div>
                            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted-2)' }}>{formatDateShort(call.call_datetime)} · {sdr?.name || '—'}</div>
                          </div>
                          <ScoreBadge score={analysis?.appointment_quality_score ?? null} />
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {rdvStatusNode(analysis)}
                          <Badge className={reviewBadgeClass(call.review_status, analysis?.human_validated)}>{reviewLabel(call.review_status, analysis?.human_validated)}</Badge>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>{campaign?.campaign_name || 'Campagne non renseignée'} · IA {analysis?.ai_confidence !== null && analysis?.ai_confidence !== undefined ? `${analysis.ai_confidence}%` : '—'}</div>
                      </Link>
                    )
                  })}
                  {visibleCalls.length === 0 && <div className="owner-history-empty">Aucune analyse trouvée pour ces filtres.</div>}
                </div>
              </div>

              {filteredCalls.length > visibleCount && (
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <button type="button" onClick={() => setVisibleCount(count => count + 12)} style={{ border: '1px solid var(--border)', background: 'rgba(2,6,23,.28)', color: 'var(--cyan)', fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
                    Voir plus
                  </button>
                </div>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* Équipe SDR */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Équipe SDR</h2>
                  <Link href="/coaching" style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)' }}>Voir coaching</Link>
                </div>
              </CardHeader>
              {sdrStats.length === 0 ? (
                <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)' }}>Aucun SDR</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 60px', padding: '6px 16px', borderBottom: '1px solid var(--border)' }}>
                    {['SDR', 'Score', 'RDV', 'Coaching'].map(h => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</span>
                    ))}
                  </div>
                  {sdrStats.map((sdr) => {
                    const needsCoaching = sdr.avg_sdr_quality === null || sdr.avg_sdr_quality < 55
                    return (
                      <div key={sdr.sdr_id} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 60px', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sdr.sdr_name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: getScoreColor(sdr.avg_sdr_quality) }}>{sdr.avg_sdr_quality ?? '—'}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sdr.rdv_booked}</span>
                        {needsCoaching
                          ? <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,.28)' }}>Requis</span>
                          : <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>—</span>
                        }
                      </div>
                    )
                  })}
                </>
              )}
            </Card>

            {/* Santé des campagnes */}
            <Card style={{ overflow: 'hidden' }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Santé des campagnes</h2>
                  <Link href="/campaigns" style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)' }}>Voir tout</Link>
                </div>
              </CardHeader>
              <div>
                {orderedCampaigns.length === 0 && (
                  <div style={{ margin: 16, padding: '28px 18px', textAlign: 'center', fontSize: 13, color: 'var(--muted-2)', background: 'rgba(125,211,252,.03)', border: '1px dashed rgba(125,211,252,.15)', borderRadius: 10 }}>
                    Créez votre première campagne pour commencer l&apos;analyse.
                  </div>
                )}
                {orderedCampaigns.map((campaign, index) => (
                  <Link key={campaign.id} href={`/campaigns/${campaign.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '13px 18px', borderBottom: index < orderedCampaigns.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.campaign_name}</div>
                        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted-2)' }}>{campaign.client_name || 'Client non renseigné'}</div>
                      </div>
                      <Badge className={getCampaignStatusBg(campaign.status)}>{getCampaignStatusLabel(campaign.status)}</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 11, color: 'var(--muted)' }}>
                      <span>{campaign.totalCalls} appels · {campaign.rdvBooked} RDV</span>
                      {campaign.totalCalls > 0
                        ? <Badge className={campaign.health.labelBg}>{campaign.health.label} · {campaign.health.score}</Badge>
                        : <span>Pas de données</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
