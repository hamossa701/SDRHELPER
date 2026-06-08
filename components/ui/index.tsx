'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
export function Card({ children, className, style: extraStyle, hoverable }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; hoverable?: boolean }) {
  return (
    <div className={cn('h3a-card', hoverable && 'h3a-card-hoverable', className)} style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      boxShadow: 'var(--shadow)',
      backdropFilter: 'blur(18px)',
      ...extraStyle,
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
  const base = 'inline-flex items-center justify-center font-semibold focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer gap-1.5 hover:opacity-90 active:scale-[0.98]'
  const variants = {
    primary: 'text-white border',
    secondary: 'border text-sm',
    ghost: 'border text-sm',
  }
  const sizes = { sm: 'text-xs px-3 py-1.5 rounded-lg h-7', md: 'text-sm px-4 py-2 rounded-xl h-9', lg: 'text-sm px-5 py-2.5 rounded-xl h-10' }
  const t = 'opacity .15s, transform .12s'
  const styles = {
    primary: { background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)', border: '1px solid rgba(125,211,252,.42)', boxShadow: '0 10px 24px rgba(37,99,235,.2)', transition: t },
    secondary: { background: 'rgba(2,6,23,.28)', border: '1px solid var(--border)', color: 'var(--muted)', transition: t },
    ghost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', transition: t },
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

// ---- Dark Select ----
export type DarkSelectOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

interface DarkSelectProps {
  value: string
  options: DarkSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  required?: boolean
  className?: string
  style?: React.CSSProperties
}

export function DarkSelect({
  value,
  options,
  onChange,
  placeholder = 'Sélectionner...',
  ariaLabel,
  disabled = false,
  required = false,
  className,
  style,
}: DarkSelectProps) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuRect, setMenuRect] = useState<React.CSSProperties | null>(null)

  const selectedIndex = useMemo(() => options.findIndex(option => option.value === value), [options, value])
const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null
  const portalMenuStyle: React.CSSProperties = {
    ...menuRect,
    background: 'linear-gradient(180deg, rgba(15,23,42,.98), rgba(6,9,20,.98))',
    border: '1px solid rgba(125,211,252,.24)',
    boxShadow: '0 18px 48px rgba(0,0,0,.52), 0 0 0 1px rgba(125,211,252,.08)',
    backdropFilter: 'blur(18px)',
  }

  function nextEnabledIndex(start: number, direction: 1 | -1) {
    if (options.length === 0) return -1
    let index = start
    for (let i = 0; i < options.length; i += 1) {
      const option = options[index]
      if (option && !option.disabled) return index
      index = (index + direction + options.length) % options.length
    }
    return -1
  }

  function updateMenuRect() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const gutter = 12
    const width = Math.max(rect.width, 180)
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter)
    setMenuRect({
      position: 'fixed',
      top: Math.min(rect.bottom + 6, window.innerHeight - gutter),
      left: Math.min(Math.max(gutter, rect.left), maxLeft),
      width,
      maxHeight: Math.max(180, window.innerHeight - rect.bottom - 18),
      zIndex: 120,
    })
  }

  function openMenu() {
    if (disabled) return
    const initialIndex = nextEnabledIndex(selectedIndex >= 0 ? selectedIndex : 0, 1)
    setActiveIndex(initialIndex >= 0 ? initialIndex : 0)
    updateMenuRect()
    setOpen(true)
  }

  function selectValue(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    updateMenuRect()
    const activeButton = optionRefs.current[activeIndex]
    activeButton?.focus()

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (optionRefs.current.some(option => option?.contains(target))) return
      setOpen(false)
    }

    function handleViewportChange() {
      updateMenuRect()
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [activeIndex, open])

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = nextEnabledIndex((activeIndex + direction + options.length) % options.length, direction)
      if (next >= 0) setActiveIndex(next)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = event.key === 'Home' ? nextEnabledIndex(0, 1) : nextEnabledIndex(options.length - 1, -1)
      if (next >= 0) setActiveIndex(next)
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn('h3a-dark-select', open && 'is-open', disabled && 'is-disabled', className)}
        style={style}
        aria-label={ariaLabel}
        data-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleButtonKeyDown}
      >
        <span className={cn('h3a-dark-select-value', !selectedOption && 'is-placeholder')}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="mat h3a-dark-select-icon" aria-hidden="true">expand_more</span>
      </button>
      {open && menuRect && typeof document !== 'undefined' && createPortal(
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          className="h3a-dark-select-menu"
          style={portalMenuStyle}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={node => { optionRefs.current[index] = node }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={cn('h3a-dark-select-option', index === activeIndex && 'is-active', option.value === value && 'is-selected')}
              onClick={() => !option.disabled && selectValue(option.value)}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={handleOptionKeyDown}
            >
              <span>{option.label}</span>
              {option.value === value && <span className="mat" aria-hidden="true">check</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// ---- Score Badge ----
export function ScoreBadge({ score }: { score: number | null }) {
  const color = score === null ? 'var(--muted-2)'
    : score >= 70 ? '#86efac'
    : score >= 40 ? '#fcd34d'
    : '#fca5a5'
  const bg = score === null ? 'rgba(2,6,23,.28)'
    : score >= 70 ? 'rgba(34,197,94,.10)'
    : score >= 40 ? 'rgba(245,158,11,.12)'
    : 'rgba(239,68,68,.12)'
  const border = score === null ? 'var(--border)'
    : score >= 70 ? 'rgba(34,197,94,.35)'
    : score >= 40 ? 'rgba(245,158,11,.32)'
    : 'rgba(239,68,68,.32)'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', padding: '3px 8px 4px', borderRadius: 6, fontSize: 12, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, whiteSpace: 'nowrap', transition: 'opacity .12s', boxShadow: score !== null ? `inset 0 0 0 1px ${color}1a` : 'none', minWidth: 34 }}>
      <span style={{ textAlign: 'center' }}>{score !== null ? score : '—'}</span>
      {score !== null && (
        <span style={{ display: 'block', marginTop: 3, height: 2, borderRadius: 1, background: 'rgba(148,163,184,.15)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', borderRadius: 1, background: color, width: `${score}%` }} />
        </span>
      )}
    </span>
  )
}

// ---- KPI / Stat Card ----
type StatCardVariant = 'default' | 'danger' | 'warning' | 'success'

const variantBorder: Record<StatCardVariant, string> = {
  default: 'transparent',
  danger:  'rgba(239,68,68,.7)',
  warning: 'rgba(245,158,11,.7)',
  success: 'rgba(34,197,94,.7)',
}

type StatCardProps = {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  dot?: string
  accent?: string
  variant?: StatCardVariant
  badge?: React.ReactNode
  trend?: React.ReactNode
  valueColor?: string
  className?: string
  style?: React.CSSProperties
}

export function StatCard({
  label,
  value,
  sub,
  dot,
  accent,
  variant,
  badge,
  trend,
  valueColor = 'var(--text)',
  className,
  style: extraStyle,
}: StatCardProps) {
  const v = variant ?? 'default'
  const variantStyle: React.CSSProperties = v !== 'default' ? {
    borderLeft: `3px solid ${variantBorder[v]}`,
    background: v === 'danger'  ? 'rgba(239,68,68,.05)'  :
                v === 'warning' ? 'rgba(245,158,11,.04)' :
                                  'rgba(34,197,94,.04)',
  } : {}
  return (
    <div className={cn('h3a-kpi-card', className)} style={{ borderLeftColor: accent, ...variantStyle, ...extraStyle }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(125,211,252,.55),transparent)', opacity: .9 }} />
      <div className="h3a-kpi-title-row">
        <div className="h3a-kpi-title">
          {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
          <span>{label}</span>
        </div>
        {badge && <div className="h3a-kpi-badge">{badge}</div>}
      </div>
      <div className="h3a-kpi-value" style={{ color: valueColor, minWidth: 0 }}>{value}</div>
      <div className="h3a-kpi-footer">
        {sub && <div className="h3a-kpi-sub" style={{ fontSize: 12, color: 'var(--muted)', fontStyle: (value === 0 || value === '—') ? 'italic' : 'normal' }}>{sub}</div>}
        {trend && <div className="h3a-kpi-trend">{trend}</div>}
      </div>
    </div>
  )
}

// ---- Empty ----
export function Empty({ title, description, action, icon = 'inbox' }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', background: 'rgba(125,211,252,.03)', border: '1px dashed rgba(125,211,252,.15)', borderRadius: 12 }}>
      <span className="mat" style={{ fontSize: 32, color: 'var(--muted-2)', display: 'block', marginBottom: 12 }}>{icon}</span>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, fontSize: 14 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: 'var(--muted-2)', lineHeight: 1.6 }}>{description}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
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
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', transition: 'opacity .12s' }}>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', transition: 'opacity .12s' }}>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', transition: 'opacity .12s' }}>
      {status === 'active' && (
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#86efac', flexShrink: 0, animation: 'h3a-pulse-dot 2s ease infinite' }} />
      )}
      {s.label}
    </span>
  )
}
