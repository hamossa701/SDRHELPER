import { cn } from '@/lib/utils'

type SkeletonProps = {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('h3a-skeleton', className)}
      style={{ borderRadius: 8, ...style }}
    />
  )
}

export function SkeletonLine({ width = '100%', height = 12 }: { width?: string | number; height?: number }) {
  return <Skeleton style={{ width, height }} />
}

export function SkeletonCard({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="h3a-skeleton-card" style={{ padding: 16, ...style }}>
      {children ?? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonLine width="46%" height={12} />
          <SkeletonLine width="76%" height={26} />
          <SkeletonLine width="62%" height={10} />
        </div>
      )}
    </div>
  )
}

export function SkeletonHeader({ titleWidth = 190, subtitleWidth = 260 }: { titleWidth?: number; subtitleWidth?: number }) {
  return (
    <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0, backdropFilter: 'blur(18px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <SkeletonLine width={titleWidth} height={13} />
        <SkeletonLine width={subtitleWidth} height={9} />
      </div>
      <Skeleton style={{ width: 128, height: 30, borderRadius: 10 }} />
    </div>
  )
}

export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="app-kpi-grid">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} style={{ minHeight: 134, padding: '15px 16px 13px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 106 }}>
            <div style={{ height: 32 }}>
              <SkeletonLine width="62%" height={11} />
            </div>
            <div style={{ minHeight: 38, display: 'flex', alignItems: 'center' }}>
              <SkeletonLine width="42%" height={28} />
            </div>
            <div style={{ height: 36, marginTop: 4 }}>
              <SkeletonLine width="54%" height={10} />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  )
}

export function SkeletonTable({ columns = 5, rows = 6, minWidth = 760 }: { columns?: number; rows?: number; minWidth?: number }) {
  return (
    <div className="h3a-skeleton-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--thead)' }}>
        <SkeletonLine width={180} height={13} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(92px, 1fr))`, gap: 14, padding: '11px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(15,23,42,.62)' }}>
            {Array.from({ length: columns }).map((_, index) => <SkeletonLine key={index} height={10} />)}
          </div>
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(92px, 1fr))`, gap: 14, padding: '14px 18px', borderBottom: row < rows - 1 ? '1px solid var(--border)' : 'none' }}>
              {Array.from({ length: columns }).map((_, col) => <SkeletonLine key={col} width={col === 0 ? '78%' : '100%'} height={12} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonCard key={index} style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
              <SkeletonLine width="38%" height={14} />
              <SkeletonLine width="64%" height={11} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <Skeleton style={{ width: 58, height: 24, borderRadius: 6 }} />
              <Skeleton style={{ width: 16, height: 16, borderRadius: 999 }} />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  )
}

export function SkeletonSectionTitle({ titleWidth = 240, subtitleWidth = 360 }: { titleWidth?: number; subtitleWidth?: number }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <SkeletonLine width={titleWidth} height={30} />
      <SkeletonLine width={subtitleWidth} height={13} />
    </section>
  )
}
