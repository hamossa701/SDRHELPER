'use client'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginCard } from '@/components/auth/LoginCard'
import { createClient } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email ou mot de passe incorrect.'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      const routes: Record<string, string> = { owner: '/dashboard', manager: '/manager', sdr: '/sdr', client: '/client' }
      router.push(routes[profile?.role || 'sdr'])
    }
  }

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
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-email">Adresse email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                required
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="login-password">Mot de passe</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={styles.input}
              />
            </div>
            {error && (
              <div className={styles.error}>{error}</div>
            )}
            <button type="submit" disabled={loading} className={styles.button}>
              {loading && <span className={styles.spinner} />}
              Se connecter
            </button>
          </form>
        </LoginCard>
      </div>
    </main>
  )
}
