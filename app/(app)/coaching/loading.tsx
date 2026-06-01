import { SkeletonHeader, SkeletonKpiGrid, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function CoachingLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={140} subtitleWidth={330} />
      <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <SkeletonKpiGrid count={3} />
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', justifyContent: 'space-between' }}>
              <SkeletonLine width={220} height={18} />
              <SkeletonLine width={170} height={18} />
            </div>
            <div className="coaching-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr' }}>
              {Array.from({ length: 3 }).map((__, col) => (
                <div key={col} style={{ padding: 18, borderRight: col < 2 ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <SkeletonLine width={130} height={11} />
                  {Array.from({ length: 5 }).map((___, row) => <SkeletonLine key={row} height={12} />)}
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
