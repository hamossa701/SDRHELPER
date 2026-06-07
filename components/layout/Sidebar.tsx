'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { UserRole } from '@/types'

interface NavItem { href: string; label: string; icon: string; roles: UserRole[]; exact?: boolean }

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: 'bar_chart', roles: ['owner'] },
  { href: '/manager', label: 'Supervision', icon: 'manage_accounts', roles: ['manager'] },
  { href: '/sdr', label: 'Mon tableau', icon: 'person', roles: ['sdr'] },
  { href: '/client', label: 'Rapport client', icon: 'description', roles: ['client'] },
  { href: '/coaching', label: 'Coaching SDR', icon: 'school', roles: ['owner', 'manager'] },
  { href: '/campaigns', label: 'Campagnes', icon: 'folder', roles: ['owner', 'manager', 'sdr'] },
  { href: '/admin/evaluation', label: 'Évaluation IA', icon: 'science', roles: ['owner'] },
  { href: '/admin/planning', label: 'Planning', icon: 'calendar_month', roles: ['owner'] },
  { href: '/calls/upload', label: 'Analyser un appel', icon: 'mic', roles: ['owner', 'manager', 'sdr'] },
  { href: '/admin/users', label: 'Utilisateurs', icon: 'group', roles: ['owner'] },
  { href: '/admin/integrations', label: 'Intégrations', icon: 'extension', roles: ['owner'], exact: true },
  { href: '/admin/integrations/health', label: 'Santé des intégrations', icon: 'monitor_heart', roles: ['owner'] },
]

export function Sidebar({ userRole, userName, orgName }: { userRole: UserRole; userName: string; orgName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const visible = NAV.filter(i => i.roles.includes(userRole))

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const navContent = (
    <>
      <div style={{ marginBottom: 28, padding: '0 4px' }}>
        <div style={{
          fontSize: 20,
          fontWeight: 800,
          background: 'linear-gradient(90deg,#ffffff,#c7d2fe 48%,#7dd3fc)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}>SDRHelper</div>
        <div style={{
          color: 'var(--muted-2)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{orgName}</div>
      </div>

      {userRole !== 'client' && (
        <Link
          href="/calls/upload"
          onClick={() => setMobileOpen(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            minHeight: 38,
            padding: '9px 12px',
            marginBottom: 16,
            borderRadius: 10,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
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

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {visible.filter(i => i.href !== '/calls/upload').map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 38,
                padding: '9px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'var(--text)' : 'var(--muted)',
                background: active ? 'linear-gradient(135deg,rgba(99,102,241,.28),rgba(125,211,252,.16))' : 'transparent',
                border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
                boxShadow: active ? 'inset 3px 0 0 var(--cyan),inset 0 0 0 1px rgba(125,211,252,.06),0 10px 30px rgba(99,102,241,.12)' : 'none',
                transition: 'background .15s, color .15s, border-color .15s',
              }}
            >
              <span className="mat" style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'linear-gradient(135deg,var(--indigo),var(--cyan))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              transition: 'outline-color .15s',
              outline: '1px solid transparent',
              outlineOffset: 2,
            }}
            onMouseOver={e => (e.currentTarget.style.outlineColor = 'var(--border-strong)')}
            onMouseOut={e => (e.currentTarget.style.outlineColor = 'transparent')}
          >{userName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
            <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>{{ owner: 'Propriétaire', manager: 'Manager', sdr: 'SDR', client: 'Client' }[userRole] ?? userRole}</div>
          </div>
          <button
            onClick={signOut}
            title="Déconnexion"
            style={{
              minWidth: 36,
              minHeight: 36,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 6,
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#fca5a5')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--muted-2)')}
          >
            <span className="mat" style={{ fontSize: 16 }}>logout</span>
          </button>
        </div>
      </div>
    </>
  )

  const sidebarStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)',
    borderRight: '1px solid var(--border)',
    width: 260,
    minWidth: 260,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 12px',
    height: '100vh',
    boxShadow: '18px 0 44px rgba(0,0,0,.22)',
  }

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          aria-label="Ouvrir la navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="mobile-menu-button"
        >
          <span className="mat" style={{ fontSize: 22 }}>menu</span>
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>SDRHelper</div>
          <div style={{ color: 'var(--muted-2)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgName}</div>
        </div>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="mobile-sidebar-backdrop"
            aria-label="Fermer la navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="mobile-sidebar-drawer"
            data-sidebar="mobile"
            style={{ ...sidebarStyle, width: 280, minWidth: 280, maxWidth: '82vw' }}
          >
            {navContent}
          </aside>
        </>
      )}

      <aside className="desktop-sidebar" data-sidebar="desktop" style={sidebarStyle}>
        {navContent}
      </aside>
    </>
  )
}
