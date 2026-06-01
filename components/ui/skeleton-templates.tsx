import { SkeletonHeader, SkeletonSectionTitle, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export function CampaignFormSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={100} subtitleWidth={0} />
      <main className="app-scroll">
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SkeletonSectionTitle titleWidth={260} subtitleWidth={340} />
          {Array.from({ length: 2 }).map((_, card) => (
            <SkeletonCard key={card} style={{ padding: 0 }}>
              <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
                <SkeletonLine width={190} height={13} />
              </div>
              <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <SkeletonLine height={38} />
                <SkeletonLine height={38} />
                <div className="campaign-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <SkeletonLine height={38} />
                  <SkeletonLine height={38} />
                </div>
              </div>
            </SkeletonCard>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SkeletonLine width={92} height={36} />
            <SkeletonLine width={150} height={36} />
          </div>
        </div>
      </main>
    </div>
  )
}

export function AnalysisProgressSkeleton({ title = 'Analyse en cours' }: { title?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <SkeletonCard style={{ width: '100%', maxWidth: 520, padding: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SkeletonLine width={48} height={48} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <SkeletonLine width={180} height={15} />
              <SkeletonLine width={280} height={12} />
            </div>
          </div>
          <SkeletonLine height={8} />
          <div className="upload-meta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <SkeletonLine height={54} />
            <SkeletonLine height={54} />
            <SkeletonLine height={54} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{title}</div>
        </div>
      </SkeletonCard>
    </div>
  )
}
