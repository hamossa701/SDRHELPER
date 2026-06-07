import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function CoachingLoading() {
  return (
    <div className="coaching-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', width: '100%', maxWidth: '100%', overflow: 'visible', minWidth: 0 }}>
      <SkeletonHeader titleWidth={140} subtitleWidth={330} />
      <div className="app-scroll coaching-page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, width: '100%', maxWidth: '100%', flex: '0 0 auto', overflowX: 'hidden', overflowY: 'visible' }}>
        <div className="app-kpi-grid coaching-kpi-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} style={{ minHeight: 134 }} />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
            <div className="coaching-profile-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)', display: 'flex', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
              <SkeletonLine width={220} height={18} />
              <SkeletonLine width={170} height={18} />
            </div>
            <div className="coaching-profile-grid" style={{ display: 'grid', minWidth: 0, width: '100%', maxWidth: '100%' }}>
              {Array.from({ length: 3 }).map((__, col) => (
                <div key={col} style={{ padding: 18, borderRight: col < 2 ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
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
