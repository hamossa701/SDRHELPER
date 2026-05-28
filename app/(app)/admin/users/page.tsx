import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase'
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
    owner: 'bg-slate-100 text-slate-700 border-slate-200',
    manager: 'bg-blue-50 text-blue-700 border-blue-200',
    sdr: 'bg-violet-50 text-violet-700 border-violet-200',
    client: 'bg-orange-50 text-orange-700 border-orange-200',
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <p className="text-gray-500 text-sm mt-1">
          {users?.length || 0} utilisateurs dans votre organisation
        </p>
      </div>

      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        💡 Pour créer de nouveaux utilisateurs, rendez-vous dans{' '}
        <strong>Supabase Dashboard → Authentication → Users</strong> puis insérez leur profil dans la table <code>users</code>.
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Équipe</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(users || []).map((u: User) => (
                <tr key={u.id} className={u.id === user.id ? 'bg-blue-50/40' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">{u.name}</span>
                      {u.id === user.id && <span className="text-xs text-gray-400">(moi)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{u.email}</td>
                  <td className="px-6 py-3">
                    <Badge className={roleBg[u.role] || 'bg-gray-100 text-gray-500 border-gray-200'}>
                      {getRoleLabel(u.role)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
