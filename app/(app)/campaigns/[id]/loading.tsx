import { SkeletonHeader, SkeletonKpiGrid, SkeletonCard, SkeletonTable, SkeletonSectionTitle, SkeletonLine } from '@/components/ui/skeleton'

export default function CampaignDetailLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={130} subtitleWidth={220} />
      <main className="app-scroll">
        <div className="app-content">
          <SkeletonSectionTitle titleWidth={320} subtitleWidth={420} />
          <SkeletonKpiGrid count={4} />
          <div className="app-responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <SkeletonCard style={{ minHeight: 170 }}>
              <SkeletonLine width={180} height={13} />
              <SkeletonLine width="100%" height={72} />
            </SkeletonCard>
            <SkeletonCard style={{ minHeight: 170 }}>
              <SkeletonLine width={160} height={13} />
              <SkeletonLine width="100%" height={72} />
            </SkeletonCard>
          </div>
          <SkeletonTable columns={7} rows={6} minWidth={980} />
        </div>
      </main>
    </div>
  )
}
