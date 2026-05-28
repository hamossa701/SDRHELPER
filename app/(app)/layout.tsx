import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const orgName = (profile.organizations as { name: string } | null)?.name || 'Organisation'

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        userRole={profile.role}
        userName={profile.name}
        orgName={orgName}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
