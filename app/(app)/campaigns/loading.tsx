import { SkeletonHeader, SkeletonList } from '@/components/ui/skeleton'

export default function CampaignsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SkeletonHeader titleWidth={110} subtitleWidth={190} />
      <div className="app-scroll">
        <div className="app-content" style={{ gap: 12 }}>
          <SkeletonList rows={6} />
        </div>
      </div>
    </div>
  )
}
