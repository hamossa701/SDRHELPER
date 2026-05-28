'use client'
import { cn } from '@/lib/utils'

// ---- Badge ----
interface BadgeProps {
  children: React.ReactNode
  className?: string
}
export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border', className)}>
      {children}
    </span>
  )
}

// ---- Card ----
interface CardProps {
  children: React.ReactNode
  className?: string
}
export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-gray-100', className)}>
      {children}
    </div>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {children}
    </div>
  )
}

// ---- Button ----
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}
export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-500',
    secondary: 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50 focus:ring-slate-300',
    ghost: 'text-slate-600 hover:bg-gray-100 focus:ring-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  }
  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2',
  }
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}

// ---- Score Badge ----
import { getScoreBg } from '@/lib/utils'
interface ScoreBadgeProps {
  score: number | null
  label?: string
}
export function ScoreBadge({ score, label }: ScoreBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-semibold border', getScoreBg(score))}>
      {score !== null ? score : '—'}{label && <span className="text-xs font-normal opacity-70">/100</span>}
    </span>
  )
}

// ---- Stat Card ----
interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  className?: string
}
export function StatCard({ label, value, sub, icon, className }: StatCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </Card>
  )
}

// ---- Empty State ----
interface EmptyProps {
  title: string
  description?: string
  action?: React.ReactNode
}
export function Empty({ title, description, action }: EmptyProps) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-3">📭</div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---- Spinner ----
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }
  return (
    <svg className={cn('animate-spin text-slate-600', sizes[size])} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
