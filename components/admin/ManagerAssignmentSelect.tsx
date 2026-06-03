'use client'

import { useState } from 'react'

type ManagerOption = {
  id: string
  name: string
}

export function ManagerAssignmentSelect({
  sdrId,
  currentManagerId,
  managers,
}: {
  sdrId: string
  currentManagerId: string | null
  managers: ManagerOption[]
}) {
  const [value, setValue] = useState(currentManagerId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function updateManager(nextValue: string) {
    setValue(nextValue)
    setSaving(true)
    setError('')

    try {
      const response = await fetch(`/api/admin/users/${sdrId}/manager`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: nextValue || null }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Mise a jour impossible')
      }
    } catch (err) {
      setValue(currentManagerId ?? '')
      setError(err instanceof Error ? err.message : 'Mise a jour impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 180 }}>
      <select
        value={value}
        disabled={saving}
        onChange={(event) => updateManager(event.target.value)}
        style={{
          width: '100%',
          minHeight: 32,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'rgba(2,6,23,.42)',
          color: 'var(--text)',
          fontSize: 12,
          fontWeight: 650,
          padding: '0 9px',
          outline: 'none',
          opacity: saving ? 0.65 : 1,
        }}
        aria-label="Manager assigne"
      >
        <option value="">Non assigne</option>
        {managers.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.name}
          </option>
        ))}
      </select>
      {error && <span style={{ color: '#fca5a5', fontSize: 11 }}>{error}</span>}
    </div>
  )
}
