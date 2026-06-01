import { SkeletonKpiGrid, SkeletonSectionTitle, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function ManagerLoading() {
  return (
    <div className="app-scroll">
      <div className="app-content" style={{ gap: 20 }}>
        <SkeletonSectionTitle titleWidth={170} subtitleWidth={230} />
        <SkeletonKpiGrid count={5} />
        <SkeletonKpiGrid count={4} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.9fr) minmax(280px, .8fr)', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SkeletonTable columns={5} rows={6} minWidth={720} />
            <SkeletonTable columns={5} rows={6} minWidth={640} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index}>
                <SkeletonLine width="56%" height={13} />
                <SkeletonLine width="100%" height={90} />
              </SkeletonCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
