import { SkeletonHeader, SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'

export default function UploadLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={160} subtitleWidth={300} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800, margin: '0 auto' }}>
          <SkeletonCard style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
              <SkeletonLine width={180} height={11} />
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <SkeletonLine height={38} />
              <SkeletonLine height={38} />
              <SkeletonLine height={38} />
            </div>
          </SkeletonCard>
          <SkeletonCard style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
              <SkeletonLine width={150} height={11} />
            </div>
            <div style={{ padding: 16 }}>
              <SkeletonLine height={360} />
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  )
}
