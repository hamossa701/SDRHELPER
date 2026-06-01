import { SkeletonHeader, SkeletonKpiGrid, SkeletonSectionTitle, SkeletonTable } from '@/components/ui/skeleton'

export default function EvaluationLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={230} subtitleWidth={0} />
      <main className="app-scroll">
        <div className="app-content">
          <SkeletonSectionTitle titleWidth={290} subtitleWidth={520} />
          <SkeletonKpiGrid count={5} />
          <SkeletonTable columns={7} rows={8} minWidth={1180} />
        </div>
      </main>
    </div>
  )
}
