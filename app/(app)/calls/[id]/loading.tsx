import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function CallDetailLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={260} subtitleWidth={360} />
      <main className="app-scroll">
        <div className="app-content" style={{ gap: 14 }}>
          <SkeletonCard style={{ minHeight: 190 }}>
            <SkeletonLine width="42%" height={26} />
            <SkeletonLine width="68%" height={13} />
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <SkeletonLine width={110} height={24} />
              <SkeletonLine width={130} height={24} />
              <SkeletonLine width={96} height={24} />
            </div>
          </SkeletonCard>
          <SkeletonCard style={{ minHeight: 220 }}>
            <SkeletonLine width={190} height={14} />
            <div className="call-detail-loading-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
              <SkeletonLine height={130} />
              <SkeletonLine height={130} />
            </div>
          </SkeletonCard>
          <div className="call-detail-loading-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SkeletonCard style={{ minHeight: 180 }} />
            <SkeletonCard style={{ minHeight: 180 }} />
          </div>
          <SkeletonCard style={{ minHeight: 110 }}>
            <SkeletonLine width={160} height={13} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <SkeletonLine width={92} height={24} />
              <SkeletonLine width={180} height={16} />
              <SkeletonLine width="44%" height={16} />
            </div>
          </SkeletonCard>
          <SkeletonCard style={{ minHeight: 160 }}>
            <SkeletonLine width={150} height={13} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <SkeletonLine width="100%" height={12} />
              <SkeletonLine width="96%" height={12} />
              <SkeletonLine width="88%" height={12} />
              <SkeletonLine width="72%" height={12} />
            </div>
          </SkeletonCard>
        </div>
        <style>{`
          @media (max-width: 820px) {
            .call-detail-loading-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </main>
    </div>
  )
}
