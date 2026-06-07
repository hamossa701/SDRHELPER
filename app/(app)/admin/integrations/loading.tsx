import { SkeletonHeader, SkeletonSectionTitle, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function IntegrationsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={0} subtitleWidth={0} />
      <main className="app-scroll">
        <div className="app-content">
          <SkeletonSectionTitle titleWidth={160} subtitleWidth={280} />
          <SkeletonCard>
            <SkeletonLine width="30%" height={15} />
            <SkeletonLine width="60%" height={12} />
            <SkeletonLine width="100%" height={36} />
            <SkeletonLine width="100%" height={36} />
          </SkeletonCard>
        </div>
      </main>
    </div>
  )
}
