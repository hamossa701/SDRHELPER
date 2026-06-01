import { SkeletonHeader, SkeletonSectionTitle, SkeletonCard, SkeletonTable, SkeletonLine } from '@/components/ui/skeleton'

export default function AdminUsersLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={130} subtitleWidth={0} />
      <main className="app-scroll">
        <div className="app-content">
          <SkeletonSectionTitle titleWidth={170} subtitleWidth={250} />
          <SkeletonCard>
            <SkeletonLine width="42%" height={13} />
            <SkeletonLine width="82%" height={12} />
          </SkeletonCard>
          <SkeletonTable columns={4} rows={7} minWidth={760} />
        </div>
      </main>
    </div>
  )
}
