import { SkeletonHeader, SkeletonKpiGrid, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function SdrLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={190} subtitleWidth={310} />
      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <SkeletonKpiGrid count={4} />
        <div className="sdr-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <SkeletonTable columns={6} rows={7} minWidth={760} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index}>
                <SkeletonLine width="60%" height={13} />
                <SkeletonLine width="100%" height={92} />
              </SkeletonCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
