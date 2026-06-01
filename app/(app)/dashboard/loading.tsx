import { SkeletonHeader, SkeletonKpiGrid, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={150} subtitleWidth={260} />
      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <SkeletonKpiGrid count={6} />
        <div className="dashboard-main-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <SkeletonCard style={{ minHeight: 320 }}>
            <SkeletonLine width={170} height={13} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
              {Array.from({ length: 5 }).map((_, index) => <SkeletonLine key={index} height={28} />)}
            </div>
          </SkeletonCard>
          <SkeletonCard style={{ minHeight: 320 }}>
            <SkeletonLine width={140} height={13} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
              {Array.from({ length: 6 }).map((_, index) => <SkeletonLine key={index} height={24} />)}
            </div>
          </SkeletonCard>
        </div>
        <SkeletonTable columns={6} rows={7} minWidth={820} />
      </div>
    </div>
  )
}
