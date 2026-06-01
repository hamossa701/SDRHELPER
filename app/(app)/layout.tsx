import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c) { try { c.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch {} } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('*, organizations(name)').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const orgName = (profile.organizations as { name: string } | null)?.name || ''

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar userRole={profile.role} userName={profile.name} orgName={orgName} />
      <main style={{
        flex: 1,
        width: '100%',
        maxWidth: 'none',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}>
        {children}
      </main>
    </div>
  )
}
