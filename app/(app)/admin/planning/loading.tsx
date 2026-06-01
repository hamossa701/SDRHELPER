import { SkeletonHeader, SkeletonSectionTitle, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function PlanningLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={90} subtitleWidth={0} />
      <main className="app-scroll">
        <div className="app-content">
          <SkeletonSectionTitle titleWidth={130} subtitleWidth={300} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <SkeletonCard style={{ minHeight: 220 }}>
              <SkeletonLine width={170} height={13} />
              {Array.from({ length: 5 }).map((_, index) => <SkeletonLine key={index} height={32} />)}
            </SkeletonCard>
            <SkeletonTable columns={4} rows={5} minWidth={520} />
          </div>
        </div>
      </main>
    </div>
  )
}
