import type { AnalysisExplainability, ExplainabilityItem, ScoreBreakdownItem } from '@/lib/analysis-explainability'
import type { InterestLevel, UserRole } from '@/types'

function temperatureLabel(level: InterestLevel | null) {
  if (level === 'hot') return 'Chaud'
  if (level === 'warm') return 'Tiède'
  if (level === 'cold') return 'Froid'
  if (level === 'unclear') return 'Indéfini'
  return '-'
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'good' | 'warn' | 'neutral' }) {
  const styles = {
    good: { bg: 'rgba(34,197,94,.10)', color: '#86efac', border: 'rgba(34,197,94,.35)' },
    warn: { bg: 'rgba(245,158,11,.12)', color: '#fcd34d', border: 'rgba(245,158,11,.32)' },
    neutral: { bg: 'rgba(2,6,23,.28)', color: 'var(--muted)', border: 'var(--border)' },
  }[tone]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 750, background: styles.bg, color: styles.color, border: `1px solid ${styles.border}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function ReasonList({ items }: { items: ExplainabilityItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ color: item.positive === false ? '#fcd34d' : '#86efac', fontSize: 13, lineHeight: '20px', fontWeight: 800 }}>
            {item.positive === false ? '!' : '+'}
          </span>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{item.label}</div>
            {item.evidence && (
              <div style={{ color: item.evidence === "Non détecté dans l'appel" ? 'var(--muted-2)' : 'var(--muted)', fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>
                {item.evidence}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdown({ items }: { items: ScoreBreakdownItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>
            <span>{item.label}</span>
            <span style={{ color: item.points > 0 ? '#86efac' : 'var(--muted-2)' }}>+{item.points}/{item.max}</span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(2,6,23,.42)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 5 }}>
            <div style={{ height: '100%', width: `${Math.round((item.points / item.max) * 100)}%`, background: item.points > 0 ? 'linear-gradient(90deg,#22c55e,#7dd3fc)' : 'transparent' }} />
          </div>
          {item.evidence && <div style={{ color: 'var(--muted-2)', fontSize: 11, lineHeight: 1.4, marginTop: 3 }}>{item.evidence}</div>}
        </div>
      ))}
    </div>
  )
}

function TrustSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(2,6,23,.18)', padding: 12, minWidth: 0 }}>
      <h3 style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{title}</h3>
      {children}
    </div>
  )
}

export function AnalysisTrustCard({
  explanation,
  role,
}: {
  explanation: AnalysisExplainability
  role: UserRole
}) {
  const isClient = role === 'client'
  const isSdr = role === 'sdr'

  return (
    <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', backdropFilter: 'blur(18px)', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(15,23,42,.62),rgba(30,41,59,.36))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 16, fontWeight: 800 }}>Pourquoi cette analyse ?</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
              {isClient ? 'Voici pourquoi ce RDV est considéré qualifié ou non qualifié.' : 'Lecture explicative basée uniquement sur les champs extraits, la transcription et les règles de scoring.'}
            </p>
          </div>
          <StatusPill tone={explanation.qualification.qualified ? 'good' : 'warn'}>
            RDV qualifié : {explanation.qualification.qualified ? 'Oui' : 'Non'}
          </StatusPill>
        </div>
      </div>

      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <TrustSection title="Qualification">
          <ReasonList items={explanation.qualification.reasons} />
        </TrustSection>

        <TrustSection title="Température">
          <div style={{ marginBottom: 10 }}>
            <StatusPill tone={explanation.temperature.level === 'hot' ? 'good' : explanation.temperature.level === 'warm' ? 'warn' : 'neutral'}>
              Température : {temperatureLabel(explanation.temperature.level)}
            </StatusPill>
          </div>
          <ReasonList items={explanation.temperature.reasons} />
        </TrustSection>

        <TrustSection title="Score">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800 }}>{explanation.score.value ?? '-'}/100</div>
            {explanation.score.isApproximation && <StatusPill tone="neutral">Score explicatif</StatusPill>}
          </div>
          {explanation.score.reason && <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>{explanation.score.reason}</p>}
          <ScoreBreakdown items={explanation.score.breakdown} />
        </TrustSection>

        <TrustSection title="Informations manquantes">
          {explanation.missingInfo.length > 0 ? <ReasonList items={explanation.missingInfo} /> : <div style={{ color: 'var(--muted-2)', fontSize: 12 }}>Aucune information critique manquante détectée.</div>}
        </TrustSection>

        <TrustSection title="Recommandation">
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 13, lineHeight: 1.55 }}>{explanation.recommendation}</p>
        </TrustSection>

        {!isClient && explanation.coachingNotes.length > 0 && (
          <TrustSection title={isSdr ? 'À améliorer la prochaine fois' : 'Signaux coaching'}>
            <ReasonList items={explanation.coachingNotes} />
          </TrustSection>
        )}
      </div>
    </section>
  )
}
