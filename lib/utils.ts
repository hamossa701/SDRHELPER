import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { InterestLevel, HallucinationRisk, UserRole, CampaignStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400'
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-600'
}

export function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-500'
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (score >= 60) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (score >= 40) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
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
    hot: 'bg-red-50 text-red-700 border-red-200',
    warm: 'bg-amber-50 text-amber-700 border-amber-200',
    cold: 'bg-blue-50 text-blue-700 border-blue-200',
    unclear: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return level ? colors[level] : 'bg-gray-100 text-gray-500 border-gray-200'
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
  if (!risk) return 'bg-gray-100 text-gray-500 border-gray-200'
  const colors: Record<HallucinationRisk, string> = {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200',
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
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-gray-100 text-gray-600 border-gray-200',
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
