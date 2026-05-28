'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }

    // Get user role to redirect appropriately
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      const roleRoutes: Record<string, string> = {
        owner: '/dashboard',
        manager: '/manager',
        sdr: '/sdr',
        client: '/client',
      }
      router.push(roleRoutes[profile?.role || 'sdr'])
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[420px] bg-slate-900 text-white p-10 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-12">
            <div className="w-9 h-9 bg-slate-600 rounded-lg flex items-center justify-center text-lg font-bold">S</div>
            <span className="text-lg font-semibold">SDRHelper</span>
          </div>
          <h2 className="text-3xl font-bold leading-tight mb-4">
            Supervisez la qualité de vos RDV sans écouter chaque appel.
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Analyse IA des transcriptions d&apos;appels, scoring automatique, coaching SDR, et reporting client — en temps réel.
          </p>
        </div>
        <div className="space-y-3">
          {[
            { icon: '🎯', text: 'Scoring automatique des RDV et des SDRs' },
            { icon: '🔍', text: 'Détection des objections et signaux d\'achat' },
            { icon: '📊', text: 'Reporting transparent pour vos clients français' },
            { icon: '🤖', text: 'Recommandations coaching personnalisées' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-slate-300">
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Connexion</h1>
            <p className="text-gray-500 text-sm mt-1">Accédez à votre espace SDRHelper</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full justify-center py-2.5">
                Se connecter
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3 font-medium">Comptes de démonstration</p>
              <div className="space-y-1.5">
                {[
                  { role: 'Propriétaire', email: 'karim@callforce.ma' },
                  { role: 'Superviseur',  email: 'yasmine@callforce.ma' },
                  { role: 'SDR',          email: 'amine@callforce.ma' },
                  { role: 'Client',       email: 'pierre@clientcorp.fr' },
                ].map(item => (
                  <div
                    key={item.email}
                    className="flex items-center justify-between text-xs cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                    onClick={() => setEmail(item.email)}
                  >
                    <span className="text-gray-500">{item.role}</span>
                    <span className="text-slate-600 font-mono">{item.email}</span>
                  </div>
                ))}
                <p className="text-xs text-gray-400 text-center pt-1">Mot de passe : Demo1234!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
