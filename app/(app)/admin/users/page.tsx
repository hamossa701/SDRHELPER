import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { User, UserRole } from '@/types'

const roleMeta: Record<UserRole, { label: string; bg: string; color: string; border: string }> = {
  owner: { label: 'Propriétaire', bg: 'rgba(125,211,252,.12)', color: 'var(--cyan)', border: 'rgba(125,211,252,.32)' },
  manager: { label: 'Superviseur', bg: 'rgba(59,130,246,.12)', color: '#93c5fd', border: 'rgba(59,130,246,.32)' },
  sdr: { label: 'SDR', bg: 'rgba(139,92,246,.12)', color: '#c4b5fd', border: 'rgba(139,92,246,.32)' },
  client: { label: 'Client', bg: 'rgba(245,158,11,.12)', color: '#fcd34d', border: 'rgba(245,158,11,.32)' },
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function RoleBadge({ role }: { role: UserRole }) {
  const meta = roleMeta[role]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 750,
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  )
}

export default async function AdminUsersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })

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

  const usersList = (users ?? []) as User[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          height: 56,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(18px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 650 }}>Administration</div>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 36px' }}>
        <style>{`
          .h3a-user-row:hover {
            background: rgba(255, 255, 255, .035) !important;
          }
        `}</style>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 700, color: 'var(--text)' }}>
              Utilisateurs
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>
              {usersList.length} utilisateurs dans votre organisation
            </p>
          </section>

          <Card>
            <div style={{ display: 'flex', gap: 12, padding: '16px 18px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--cyan)',
                  background: 'var(--cyan-soft)',
                  border: '1px solid rgba(125,211,252,.22)',
                  fontSize: 18,
                  flexShrink: 0,
                  fontWeight: 800,
                  fontFamily: 'var(--font-geist), system-ui, sans-serif',
                }}
              >
                i
              </div>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>Création des accès</div>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
                  Pour créer de nouveaux utilisateurs, ajoutez le compte dans Supabase Authentication puis insérez le profil
                  correspondant dans la table <code style={{ color: 'var(--cyan)' }}>users</code>.
                </p>
              </div>
            </div>
          </Card>

          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Équipe</h2>
                <span style={{ color: 'var(--muted-2)', fontSize: 12, fontWeight: 650 }}>{usersList.length} comptes</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'var(--thead)' }}>
                    {['Nom', 'Email', 'Rôle', 'Créé le'].map((label) => (
                      <th
                        key={label}
                        style={{
                          padding: '10px 18px',
                          textAlign: 'left',
                          color: 'var(--muted-2)',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '.04em',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((member) => {
                    const isCurrentUser = member.id === user.id
                    return (
                      <tr
                        className="h3a-user-row"
                        key={member.id}
                        style={{
                          background: isCurrentUser ? 'rgba(125,211,252,.06)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                                background: isCurrentUser ? 'var(--cyan-soft)' : 'rgba(15,23,42,.72)',
                                border: isCurrentUser ? '1px solid rgba(125,211,252,.32)' : '1px solid var(--border)',
                                color: isCurrentUser ? 'var(--cyan)' : 'var(--muted)',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {initials(member.name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>
                                {member.name}
                              </div>
                              {isCurrentUser && (
                                <div style={{ color: 'var(--cyan)', fontSize: 11, fontWeight: 650, marginTop: 2 }}>Session actuelle</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 18px', color: 'var(--muted)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                          {member.email}
                        </td>
                        <td style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                          <RoleBadge role={member.role} />
                        </td>
                        <td style={{ padding: '14px 18px', color: 'var(--muted-2)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                          {formatDate(member.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
