import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function CallDetailLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={260} subtitleWidth={360} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto' }}>
          <SkeletonCard style={{ minHeight: 190 }}>
            <SkeletonLine width="42%" height={26} />
            <SkeletonLine width="68%" height={13} />
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <SkeletonLine width={110} height={24} />
              <SkeletonLine width={130} height={24} />
            </div>
          </SkeletonCard>
          <SkeletonCard style={{ minHeight: 220 }}>
            <SkeletonLine width={190} height={14} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
              <SkeletonLine height={130} />
              <SkeletonLine height={130} />
            </div>
          </SkeletonCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SkeletonCard style={{ minHeight: 180 }} />
            <SkeletonCard style={{ minHeight: 180 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
