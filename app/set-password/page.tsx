'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LoginCard } from '@/components/auth/LoginCard'
import styles from '../login/login.module.css'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
      else setChecking(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      const dest = profile?.role === 'client' ? '/client' : '/dashboard'
      router.push(dest)
    } else {
      router.push('/login')
    }
  }

  if (checking) return null

  return (
    <main className={styles.page}>
      <div className={styles.circleOne} />
      <div className={styles.circleTwo} />
      <div className={styles.circleThree} />

      <div className={styles.secureBadge}>
        <span className={styles.secureDot} />
        Accès sécurisé
      </div>

      <div className={styles.content}>
        <div className={styles.brand} aria-label="SDRHelper">
          <div className={styles.brandTitle}>SDR<span>Helper</span></div>
          <div className={styles.brandKicker}>Supervision appels B2B</div>
        </div>

        <LoginCard>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="sp-password">Nouveau mot de passe</label>
              <input
                id="sp-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="sp-confirm">Confirmer le mot de passe</label>
              <input
                id="sp-confirm"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className={styles.input}
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.button}>
              {loading && <span className={styles.spinner} />}
              Enregistrer le mot de passe
            </button>
          </form>
        </LoginCard>
      </div>
    </main>
  )
}
