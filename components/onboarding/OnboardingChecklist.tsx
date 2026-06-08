'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { UserRole } from '@/types'

type Item = { id: string; label: string; href: string }

const ITEMS: Record<UserRole, Item[]> = {
  owner: [
    { id: 'examine', label: 'Examiner une analyse', href: '/calls/upload' },
    { id: 'validate', label: 'Valider une analyse', href: '/calls/upload' },
    { id: 'campaigns', label: 'Consulter la santé des campagnes', href: '/campaigns' },
    { id: 'coaching', label: 'Identifier un SDR à coacher', href: '/coaching' },
  ],
  manager: [
    { id: 'team', label: 'Voir les appels de son équipe', href: '/manager' },
    { id: 'examine', label: 'Examiner une analyse', href: '/manager' },
    { id: 'validate', label: 'Valider une analyse', href: '/manager' },
    { id: 'coaching', label: 'Consulter les recommandations coaching', href: '/sdr' },
  ],
  sdr: [
    { id: 'score', label: 'Voir son dernier score', href: '/sdr' },
    { id: 'coaching', label: 'Lire ses recommandations coaching', href: '/sdr' },
    { id: 'rdv', label: 'Vérifier ses derniers RDV', href: '/sdr' },
    { id: 'qualification', label: 'Comprendre les critères de qualification', href: '/sdr' },
  ],
  client: [
    { id: 'rdv', label: 'Voir les RDV obtenus', href: '/client' },
    { id: 'quality', label: 'Vérifier la qualité des RDV', href: '/client' },
    { id: 'performance', label: 'Consulter la performance de campagne', href: '/client' },
  ],
}

interface Props {
  role: UserRole
}

export function OnboardingChecklist({ role }: Props) {
  const items = ITEMS[role] ?? []
  const STORAGE_KEY = `sdrhelper_onboarding_${role}`

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(`${STORAGE_KEY}_dismissed`) === 'true' } catch { return false }
  })

  const [completedItems, setCompletedItems] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}_completed`)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch { return [] }
  })

  useEffect(() => {
    if (dismissed) return
    const allDone = items.length > 0 && items.every(i => completedItems.includes(i.id))
    if (!allDone) return
    try {
      const ts = localStorage.getItem(`${STORAGE_KEY}_completed_at`)
      if (ts && Date.now() - Number(ts) > 86_400_000) {
        setDismissed(true)
        localStorage.setItem(`${STORAGE_KEY}_dismissed`, 'true')
      }
    } catch {}
  }, [completedItems, dismissed, items, STORAGE_KEY])

  const toggleItem = (itemId: string) => {
    const next = completedItems.includes(itemId)
      ? completedItems.filter(id => id !== itemId)
      : [...completedItems, itemId]
    setCompletedItems(next)
    try { localStorage.setItem(`${STORAGE_KEY}_completed`, JSON.stringify(next)) } catch {}
    if (items.every(i => next.includes(i.id))) {
      try { localStorage.setItem(`${STORAGE_KEY}_completed_at`, Date.now().toString()) } catch {}
    }
  }

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(`${STORAGE_KEY}_dismissed`, 'true') } catch {}
  }

  const reopen = () => {
    setDismissed(false)
    try { localStorage.removeItem(`${STORAGE_KEY}_dismissed`) } catch {}
  }

  const completed = items.filter(i => completedItems.includes(i.id)).length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = completed === total

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={reopen}
        style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'rgba(2,6,23,.38)', color: 'var(--muted)', fontSize: 11,
          fontWeight: 600, cursor: 'pointer', letterSpacing: '.04em',
        }}
      >
        <span style={{ color: 'var(--cyan)' }}>✦</span>
        Guide de démarrage · {completed}/{total}
      </button>
    )
  }

  return (
    <div style={{
      background: allDone ? 'rgba(34,197,94,.04)' : 'rgba(125,211,252,.03)',
      border: `1px solid ${allDone ? 'rgba(34,197,94,.2)' : 'rgba(125,211,252,.14)'}`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: allDone ? '#86efac' : 'var(--cyan)' }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Guide de démarrage</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
            background: allDone ? 'rgba(34,197,94,.14)' : 'rgba(125,211,252,.10)',
            color: allDone ? '#86efac' : 'var(--cyan)',
            border: `1px solid ${allDone ? 'rgba(34,197,94,.28)' : 'rgba(125,211,252,.18)'}`,
          }}>
            {completed}/{total}
          </span>
          <div style={{ width: 72, height: 4, borderRadius: 4, background: 'rgba(148,163,184,.14)', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 4,
              background: allDone ? '#86efac' : 'var(--cyan)',
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          style={{ background: 'none', border: 'none', color: 'var(--muted-2)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
          aria-label="Fermer le guide"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {items.map((item, i) => {
          const done = completedItems.includes(item.id)
          const isLastRow = i >= items.length - (items.length % 2 === 0 ? 2 : 1)
          const isOdd = i % 2 === 0
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                borderRight: isOdd ? '1px solid var(--border)' : 'none',
                borderBottom: isLastRow ? 'none' : '1px solid var(--border)',
                width: items.length === 3 ? '33.33%' : '50%',
                minWidth: 180, boxSizing: 'border-box',
              }}
            >
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: done ? 'none' : '1.5px solid rgba(148,163,184,.3)',
                  background: done ? (allDone ? '#86efac' : 'var(--cyan)') : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s',
                }}
                aria-pressed={done}
              >
                {done && <span style={{ fontSize: 10, color: '#060914', fontWeight: 800, lineHeight: 1 }}>✓</span>}
              </button>
              <span style={{
                flex: 1, fontSize: 12, color: done ? 'var(--muted-2)' : 'var(--text)',
                fontWeight: done ? 400 : 500,
                textDecoration: done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.label}
              </span>
              {!done && (
                <Link href={item.href} style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700, flexShrink: 0 }}>
                  →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
