'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type DateTimePickerProps = {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const HOURS = Array.from({ length: 11 }, (_, i) => two(i + 8))
const MINUTES = Array.from({ length: 12 }, (_, index) => two(index * 5))

function two(value: number) {
  return String(value).padStart(2, '0')
}

function parseLocalValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return new Date()
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
}

function toLocalInputValue(date: Date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`
}

function displayDateTime(value: string) {
  const date = parseLocalValue(value)
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function nextFriday() {
  const today = startOfDay(new Date())
  const daysUntilFriday = (5 - today.getDay() + 7) % 7
  return addDays(today, daysUntilFriday)
}

function monthDays(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const firstWeekday = (first.getDay() + 6) % 7
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function DateTimePicker({ value, onChange, ariaLabel = 'Date et heure de l appel' }: DateTimePickerProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => parseLocalValue(value))
  const [viewMonth, setViewMonth] = useState(() => startOfDay(parseLocalValue(value)))
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)

  const cells = useMemo(() => monthDays(viewMonth), [viewMonth])
  const today = useMemo(() => startOfDay(new Date()), [])

  function updatePanelPosition() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const gutter = 12
    const width = Math.min(360, window.innerWidth - gutter * 2)
    const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter))
    const roomBelow = window.innerHeight - rect.bottom - gutter
    const panelHeight = 380
    const top = window.innerWidth <= 460
      ? gutter
      : roomBelow >= panelHeight
        ? rect.bottom + 8
        : Math.max(gutter, window.innerHeight - panelHeight - gutter)
    setPanelStyle({
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: `calc(100vh - ${gutter * 2}px)`,
      zIndex: 140,
    })
  }

  function openPicker() {
    const parsed = parseLocalValue(value)
    setDraft(parsed)
    setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1))
    updatePanelPosition()
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  function updateDraftDate(nextDate: Date) {
    setDraft(prev => new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), prev.getHours(), prev.getMinutes()))
    setViewMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }

  function updateDraftTime(kind: 'hour' | 'minute', nextValue: string) {
    setDraft(prev => {
      const next = new Date(prev)
      if (kind === 'hour') next.setHours(Number(nextValue))
      if (kind === 'minute') next.setMinutes(Number(nextValue))
      return next
    })
  }

  function confirm() {
    onChange(toLocalInputValue(draft))
    closePicker()
  }

  useEffect(() => {
    if (!open) return

    updatePanelPosition()

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePicker()
    }

    function handleViewportChange() {
      updatePanelPosition()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`h3a-datetime-trigger${open ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className="mat h3a-datetime-trigger-icon" aria-hidden="true">calendar_month</span>
        <span>{displayDateTime(value)}</span>
      </button>

      {open && panelStyle && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} role="dialog" aria-label={ariaLabel} className="h3a-datetime-panel" style={panelStyle}>
          <div className="h3a-datetime-header">
            <button type="button" className="h3a-datetime-icon-button" aria-label="Mois precedent" onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
              <span className="mat" aria-hidden="true">chevron_left</span>
            </button>
            <div className="h3a-datetime-title">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</div>
            <button type="button" className="h3a-datetime-icon-button" aria-label="Mois suivant" onClick={() => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
              <span className="mat" aria-hidden="true">chevron_right</span>
            </button>
          </div>

          <div className="h3a-datetime-quick-row">
            {[
              { label: 'Aujourdhui', date: today },
              { label: 'Demain', date: addDays(today, 1) },
              { label: 'Dans 2j', date: addDays(today, 2) },
              { label: 'Vendredi', date: nextFriday() },
            ].map(item => (
              <button key={item.label} type="button" className="h3a-datetime-quick" onClick={() => updateDraftDate(item.date)}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="h3a-datetime-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className="h3a-datetime-grid">
            {cells.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} className="h3a-datetime-empty-day" />
              const selected = sameDay(date, draft)
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={`h3a-datetime-day${selected ? ' is-selected' : ''}${sameDay(date, today) ? ' is-today' : ''}`}
                  aria-pressed={selected}
                  onClick={() => updateDraftDate(date)}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="h3a-datetime-time-row">
            <label className="h3a-datetime-time-label">
              <span>Heure</span>
              <select className="h3a-datetime-time-select" value={two(draft.getHours())} onChange={e => updateDraftTime('hour', e.target.value)}>
                {!HOURS.includes(two(draft.getHours())) && <option value={two(draft.getHours())}>{two(draft.getHours())}h</option>}
                {HOURS.map(hour => <option key={hour} value={hour}>{hour}h</option>)}
              </select>
            </label>
            <label className="h3a-datetime-time-label">
              <span>Minute</span>
              <select className="h3a-datetime-time-select" value={two(draft.getMinutes())} onChange={e => updateDraftTime('minute', e.target.value)}>
                {MINUTES.map(minute => <option key={minute} value={minute}>{minute}</option>)}
              </select>
            </label>
          </div>

          <div className="h3a-datetime-actions">
            <button type="button" className="h3a-datetime-cancel" onClick={closePicker}>Annuler</button>
            <button type="button" className="h3a-datetime-confirm" onClick={confirm}>Confirmer</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
