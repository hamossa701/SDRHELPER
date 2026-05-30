import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardHeader, Badge } from '@/components/ui'
import { getRoleLabel, formatDate } from '@/lib/utils'
import type { User } from '@/types'

export default async function AdminUsersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any) { try { c.forEach(({name,value,options}: any) => cookieStore.set(name,value,options)) } catch {} } } })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') redirect('/dashboard')

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('role')
    .order('name')

  const roleBg: Record<string, string> = {
    owner:   'bg-slate-700 text-slate-200 border-slate-500',
    manager: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    sdr:     'bg-violet-500/10 text-violet-400 border-violet-500/30',
    client:  'bg-orange-500/10 text-orange-400 border-orange-500/30',
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <p className="text-slate-400 text-sm mt-1">
          {users?.length || 0} utilisateurs dans votre organisation
        </p>
      </div>

      <div className="mb-4 p-4 rounded-lg text-sm" style={{ background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
        Pour créer de nouveaux utilisateurs, rendez-vous dans{' '}
        <strong>Supabase Dashboard → Authentication → Users</strong> puis insérez leur profil dans la table <code>users</code>.
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Équipe</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(users || []).map((u: User) => (
                <tr key={u.id} className={u.id === user.id ? 'bg-blue-500/10' : 'hover:bg-white/5'}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-200">{u.name}</span>
                      {u.id === user.id && <span className="text-xs text-slate-500">(moi)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-slate-400">{u.email}</td>
                  <td className="px-6 py-3">
                    <Badge className={roleBg[u.role] || 'bg-slate-700 text-slate-300 border-slate-500'}>
                      {getRoleLabel(u.role)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
