import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { InterestLevel, HallucinationRisk, UserRole, CampaignStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getScoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-blue-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

export function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-slate-800 text-slate-400 border-slate-600'
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  if (score >= 60) return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
  if (score >= 40) return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  return 'bg-red-500/10 text-red-400 border-red-500/30'
}

export function getInterestLabel(level: InterestLevel | null): string {
  const labels: Record<InterestLevel, string> = {
    hot: '🔥 Chaud',
    warm: '🌡️ Tiède',
    cold: '❄️ Froid',
    unclear: '❓ Indéfini',
  }
  return level ? labels[level] : '—'
}

export function getInterestBg(level: InterestLevel | null): string {
  const colors: Record<InterestLevel, string> = {
    hot: 'bg-red-500/10 text-red-400 border-red-500/30',
    warm: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    cold: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    unclear: 'bg-slate-800 text-slate-400 border-slate-600',
  }
  return level ? colors[level] : 'bg-slate-800 text-slate-400 border-slate-600'
}

export function getRiskLabel(risk: HallucinationRisk | null): string {
  if (!risk) return '—'
  const labels: Record<HallucinationRisk, string> = {
    low: 'Fiable',
    medium: 'Modéré',
    high: 'Risqué',
  }
  return labels[risk]
}

export function getRiskBg(risk: HallucinationRisk | null): string {
  if (!risk) return 'bg-slate-800 text-slate-400 border-slate-600'
  const colors: Record<HallucinationRisk, string> = {
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    high: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return colors[risk]
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    owner: 'Propriétaire',
    manager: 'Superviseur',
    sdr: 'SDR',
    client: 'Client',
  }
  return labels[role]
}

export function getCampaignStatusLabel(status: CampaignStatus): string {
  const labels: Record<CampaignStatus, string> = {
    active: 'Active',
    paused: 'En pause',
    completed: 'Terminée',
  }
  return labels[status]
}

export function getCampaignStatusBg(status: CampaignStatus): string {
  const colors: Record<CampaignStatus, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    completed: 'bg-slate-800 text-slate-400 border-slate-600',
  }
  return colors[status]
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(dateString: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  })
}
