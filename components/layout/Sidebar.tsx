'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { UserRole } from '@/types'

interface NavItem { href: string; label: string; icon: string; roles: UserRole[] }

const NAV: NavItem[] = [
  { href: '/dashboard',    label: 'Tableau de bord',  icon: 'bar_chart',       roles: ['owner'] },
  { href: '/manager',      label: 'Supervision',       icon: 'manage_accounts', roles: ['manager'] },
  { href: '/sdr',          label: 'Mon tableau',       icon: 'person',          roles: ['sdr'] },
  { href: '/client',       label: 'Rapport client',    icon: 'description',     roles: ['client'] },
  { href: '/coaching',     label: 'Coaching SDR',      icon: 'school',          roles: ['owner', 'manager'] },
  { href: '/campaigns',     label: 'Campagnes',          icon: 'folder',          roles: ['owner', 'manager', 'sdr'] },
  { href: '/admin/evaluation', label: 'Evaluation IA',    icon: 'science',         roles: ['owner'] },
  { href: '/admin/planning',label: 'Planning',           icon: 'calendar_month',  roles: ['owner'] },
  { href: '/calls/upload',  label: 'Analyser un appel',  icon: 'mic',             roles: ['owner', 'manager', 'sdr'] },
  { href: '/admin/users',  label: 'Utilisateurs',      icon: 'group',           roles: ['owner'] },
]

export function Sidebar({ userRole, userName, orgName }: { userRole: UserRole; userName: string; orgName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const visible = NAV.filter(i => i.roles.includes(userRole))

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <aside style={{
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border)',
      width: 240,
      minWidth: 240,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 12px',
      height: '100vh',
      boxShadow: '18px 0 44px rgba(0,0,0,.22)',
    }}>
      {/* Brand */}
      <div style={{ marginBottom: 28, padding: '0 4px' }}>
        <div style={{
          fontSize: 20, fontWeight: 800,
          background: 'linear-gradient(90deg,#ffffff,#c7d2fe 48%,#7dd3fc)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>SDRHelper</div>
        <div style={{ color: 'var(--muted-2)', fontSize: 10, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', marginTop: 2 }}>{orgName}</div>
      </div>

      {/* Analyse button — hidden for client role */}
      {userRole !== 'client' && (
        <Link href="/calls/upload" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 12px', marginBottom: 16, borderRadius: 10, textDecoration: 'none',
          fontSize: 13, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg,#4f46e5,#2563eb 52%,#0891b2)',
          border: '1px solid rgba(125,211,252,.42)',
          boxShadow: '0 10px 24px rgba(37,99,235,.18)',
        }}
          onMouseOver={e => (e.currentTarget.style.opacity = '.88')}
          onMouseOut={e => (e.currentTarget.style.opacity = '1')}
        >
          <span className="mat" style={{ fontSize: 16 }}>mic</span>
          Analyser un appel
        </Link>
      )}

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {visible.filter(i => i.href !== '/calls/upload').map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
              color: active ? 'var(--text)' : 'var(--muted)',
              background: active ? 'linear-gradient(135deg,rgba(99,102,241,.22),rgba(125,211,252,.12))' : 'transparent',
              border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
              boxShadow: active ? 'inset 0 0 0 1px rgba(125,211,252,.06),0 10px 30px rgba(99,102,241,.12)' : 'none',
              transition: 'background .15s, color .15s, border-color .15s',
            }}>
              <span className="mat" style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,var(--indigo),var(--cyan))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>{userName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
            <div style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'capitalize' }}>{userRole}</div>
          </div>
          <button onClick={signOut} title="Déconnexion" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted-2)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6,
          }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--cyan)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--muted-2)')}
          >
            <span className="mat" style={{ fontSize: 16 }}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
