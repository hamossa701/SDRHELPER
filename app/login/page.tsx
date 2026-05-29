'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
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

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'var(--input-bg)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
    fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', alignItems: 'stretch' }}>
      {/* Left panel */}
      <div style={{
        width: 400, flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        padding: '40px 32px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 22, fontWeight: 800, background: 'linear-gradient(90deg,#ffffff,#c7d2fe 48%,#7dd3fc)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>SDRHelper</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted-2)', marginTop: 2 }}>Supervision appels B2B</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 12 }}>
            Supervisez la qualité de vos RDV sans écouter chaque appel.
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Analyse IA des transcriptions, scoring SDR, coaching et reporting client en temps réel.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: 'bar_chart',   text: 'Scoring automatique RDV et SDR' },
            { icon: 'search',      text: 'Détection objections et signaux achat' },
            { icon: 'description', text: 'Reporting transparent clients français' },
            { icon: 'school',      text: 'Recommandations coaching personnalisées' },
          ].map(item => (
            <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
              <span className="mat" style={{ fontSize: 16, color: 'var(--cyan)', flexShrink: 0 }}>{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Connexion</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Accédez à votre espace SDRHelper</div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, backdropFilter: 'blur(18px)', boxShadow: 'var(--shadow)' }}>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Adresse email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.fr" required style={inp}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(125,211,252,.06)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Mot de passe</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inp}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(125,211,252,.06)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              {error && (
                <div style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fca5a5' }}>{error}</div>
              )}
              <button type="submit" disabled={loading} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1,
                background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
                border: '1px solid rgba(125,211,252,.42)',
                boxShadow: '0 10px 24px rgba(37,99,235,.2)',
                fontFamily: 'Geist, sans-serif',
              }}>
                {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />}
                Se connecter
              </button>
            </form>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted-2)', textAlign: 'center', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>Comptes de démonstration</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { role: 'Propriétaire', email: 'salesagency@gmail.com' },
                  { role: 'SDR',          email: 'amine@callforce.ma' },
                ].map(item => (
                  <div key={item.email} onClick={() => setEmail(item.email)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--row-h)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: 'var(--muted-2)' }}>{item.role}</span>
                    <span style={{ color: 'var(--cyan)', fontFamily: 'monospace' }}>{item.email}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--muted-2)', textAlign: 'center', marginTop: 4 }}>Mot de passe : Admin1234!</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
