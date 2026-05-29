'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import type { UserRole } from '@/types'

interface NavItem {
  href: string
  label: string
  icon: string
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Tableau de bord',   icon: '◼',  roles: ['owner'] },
  { href: '/manager',       label: 'Supervision',        icon: '◼',  roles: ['manager'] },
  { href: '/sdr',           label: 'Mon tableau',        icon: '◼',  roles: ['sdr'] },
  { href: '/client',        label: 'Rapport client',     icon: '◼',  roles: ['client'] },
  { href: '/coaching',      label: 'Coaching SDR',       icon: '🎯', roles: ['owner', 'manager'] },
  { href: '/campaigns',     label: 'Campagnes',          icon: '📁', roles: ['owner', 'manager', 'sdr'] },
  { href: '/calls/upload',  label: 'Analyser un appel',  icon: '🎙️', roles: ['owner', 'manager', 'sdr'] },
  { href: '/admin/users',   label: 'Utilisateurs',       icon: '👥', roles: ['owner'] },
]

interface SidebarProps {
  userRole: UserRole
  userName: string
  orgName: string
}

export function Sidebar({ userRole, userName, orgName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(userRole))

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">S</div>
          <div>
            <p className="text-white text-sm font-semibold leading-none">SDRHelper</p>
            <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[120px]">{orgName}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-medium">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-slate-400 text-xs capitalize">{userRole}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full mt-2 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <span>↩</span> Déconnexion
        </button>
      </div>
    </aside>
  )
}
