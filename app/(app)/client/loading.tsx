import { SkeletonKpiGrid, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function ClientLoading() {
  return (
    <div className="app-scroll">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SkeletonLine width={260} height={26} />
          <SkeletonLine width={420} height={13} />
        </div>
        <SkeletonLine width={160} height={34} />
      </div>
      <SkeletonKpiGrid count={5} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr .9fr', gap: 16, marginTop: 16 }}>
        <SkeletonCard style={{ minHeight: 260 }}>
          <SkeletonLine width={180} height={13} />
          <SkeletonLine width="100%" height={190} />
        </SkeletonCard>
        <SkeletonCard style={{ minHeight: 260 }}>
          <SkeletonLine width={150} height={13} />
          <SkeletonLine width="100%" height={190} />
        </SkeletonCard>
      </div>
      <div style={{ marginTop: 16 }}>
        <SkeletonTable columns={7} rows={7} minWidth={900} />
      </div>
    </div>
  )
}
