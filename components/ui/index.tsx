'use client'
import { cn } from '@/lib/utils'

// ---- Badge ----
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-600 border', className)}>
      {children}
    </span>
  )
}

// ---- Card ----
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('h3a-card', className)} style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      boxShadow: 'var(--shadow)',
      backdropFilter: 'blur(18px)',
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-5 py-3.5 border-b', className)} style={{ borderColor: 'var(--border)' }}>
      {children}
    </div>
  )
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

// ---- Button ----
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}
export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-semibold transition-opacity focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed gap-1.5 hover:opacity-90'
  const variants = {
    primary: 'text-white border',
    secondary: 'border text-sm',
    ghost: 'border text-sm',
  }
  const sizes = { sm: 'text-xs px-3 py-1.5 rounded-lg h-7', md: 'text-sm px-4 py-2 rounded-xl h-9', lg: 'text-sm px-5 py-2.5 rounded-xl h-10' }
  const styles = {
    primary: { background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.2)' },
    secondary: { background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', color: 'var(--muted)' },
    ghost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' },
  }
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      style={styles[variant]}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
      )}
      {children}
    </button>
  )
}

// ---- Score Badge ----
export function ScoreBadge({ score }: { score: number | null }) {
  const color = score === null ? 'var(--muted-2)'
    : score >= 80 ? '#86efac'
    : score >= 60 ? 'var(--cyan)'
    : score >= 40 ? '#fcd34d'
    : '#fca5a5'
  const bg = score === null ? 'rgba(2,6,23,.28)'
    : score >= 80 ? 'rgba(34,197,94,.10)'
    : score >= 60 ? 'var(--cyan-soft)'
    : score >= 40 ? 'rgba(245,158,11,.12)'
    : 'rgba(239,68,68,.12)'
  const border = score === null ? 'var(--border)'
    : score >= 80 ? 'rgba(34,197,94,.35)'
    : score >= 60 ? 'rgba(125,211,252,.28)'
    : score >= 40 ? 'rgba(245,158,11,.32)'
    : 'rgba(239,68,68,.32)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, color, background: bg, border: `1px solid ${border}` }}>
      {score !== null ? score : '—'}
    </span>
  )
}

// ---- Stat Card ----
export function StatCard({ label, value, sub, dot }: { label: string; value: string | number; sub?: string; dot?: string }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px',
      backdropFilter: 'blur(18px)',
      boxShadow: 'var(--shadow)',
      position: 'relative',
      overflow: 'hidden',
      minHeight: 100,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(125,211,252,.55),transparent)', opacity: .7 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
        {label}
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 600, color: 'var(--text)', lineHeight: 1, letterSpacing: '-.02em' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ---- Empty ----
export function Empty({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>{description}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

// ---- Spinner ----
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 16 : size === 'md' ? 24 : 36
  return (
    <span style={{ width: s, height: s, border: `3px solid rgba(148,163,184,.18)`, borderTopColor: 'var(--cyan)', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
  )
}

// ---- Interest Badge ----
import { getInterestLabel } from '@/lib/utils'
import type { InterestLevel } from '@/types'
export function InterestBadge({ level }: { level: InterestLevel | null }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    hot:     { bg: 'rgba(239,68,68,.12)',   color: '#fca5a5', border: 'rgba(239,68,68,.32)' },
    warm:    { bg: 'rgba(245,158,11,.12)',  color: '#fcd34d', border: 'rgba(245,158,11,.32)' },
    cold:    { bg: 'rgba(59,130,246,.12)',  color: '#93c5fd', border: 'rgba(59,130,246,.30)' },
    unclear: { bg: 'rgba(2,6,23,.28)',      color: 'var(--muted)', border: 'var(--border)' },
  }
  const s = level ? styles[level] : styles.unclear
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {getInterestLabel(level)}
    </span>
  )
}

// ---- Risk Badge ----
import { getRiskLabel } from '@/lib/utils'
import type { HallucinationRisk } from '@/types'
export function RiskBadge({ risk }: { risk: HallucinationRisk | null }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    low:    { bg: 'rgba(34,197,94,.10)',  color: '#86efac', border: 'rgba(34,197,94,.35)' },
    medium: { bg: 'rgba(245,158,11,.12)', color: '#fcd34d', border: 'rgba(245,158,11,.32)' },
    high:   { bg: 'rgba(239,68,68,.12)',  color: '#fca5a5', border: 'rgba(239,68,68,.32)' },
  }
  const s = risk ? styles[risk] : { bg: 'rgba(2,6,23,.28)', color: 'var(--muted)', border: 'var(--border)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      IA : {getRiskLabel(risk)}
    </span>
  )
}

// ---- Status Badge ----
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    active:    { bg: 'rgba(34,197,94,.10)',  color: '#86efac', border: 'rgba(34,197,94,.35)',   label: 'Active' },
    paused:    { bg: 'rgba(245,158,11,.12)', color: '#fcd34d', border: 'rgba(245,158,11,.32)',  label: 'En pause' },
    completed: { bg: 'rgba(2,6,23,.28)',     color: 'var(--muted)', border: 'var(--border)',   label: 'Terminée' },
  }
  const s = map[status] || map.completed
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}
