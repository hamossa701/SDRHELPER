export type ReviewRole = 'owner' | 'manager' | 'sdr' | 'client' | string

export type ReviewProfile = {
  organization_id: string | null
  role: ReviewRole | null
}

export type ReviewCallAccess = {
  organization_id: string | null
  assigned_to?: string | null
  review_status?: string | null
}

export type RbacDecision = {
  allowed: boolean
  status: 403 | 404 | 409
  error: string
}

const ALLOWED: RbacDecision = { allowed: true, status: 403, error: '' }

function deny(status: 403 | 404 | 409, error: string): RbacDecision {
  return { allowed: false, status, error }
}

function hasOrganizationAccess(profile: ReviewProfile, call: ReviewCallAccess): boolean {
  return Boolean(profile.organization_id && call.organization_id === profile.organization_id)
}

function baseReviewAccess(profile: ReviewProfile, call: ReviewCallAccess): RbacDecision {
  if (!hasOrganizationAccess(profile, call)) {
    return deny(404, 'Ressource introuvable')
  }

  if (profile.role === 'owner' || profile.role === 'manager') {
    return ALLOWED
  }

  return deny(403, 'Acces refuse')
}

export function canClaimReview(
  profile: ReviewProfile,
  userId: string,
  call: ReviewCallAccess,
): RbacDecision {
  const base = baseReviewAccess(profile, call)
  if (!base.allowed) return base

  if (profile.role === 'owner') return ALLOWED

  if (call.assigned_to) {
    return deny(409, call.assigned_to === userId ? 'Deja pris en charge' : 'Revue deja assignee')
  }

  if (call.review_status === 'resolved') {
    return deny(409, 'Revue deja resolue')
  }

  return ALLOWED
}

export function canResolveReview(
  profile: ReviewProfile,
  userId: string,
  call: ReviewCallAccess,
): RbacDecision {
  const base = baseReviewAccess(profile, call)
  if (!base.allowed) return base

  if (profile.role === 'owner') return ALLOWED

  if (call.assigned_to !== userId) {
    return deny(403, 'Revue non assignee a votre file')
  }

  return ALLOWED
}

export function canValidateAnalysis(
  profile: ReviewProfile,
  userId: string,
  call: ReviewCallAccess,
): RbacDecision {
  const base = baseReviewAccess(profile, call)
  if (!base.allowed) return base

  if (profile.role === 'owner') return ALLOWED

  if (call.assigned_to !== userId) {
    return deny(403, 'Analyse non assignee a votre file de revision')
  }

  return ALLOWED
}
