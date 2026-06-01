export type ProspectDisplayInput = {
  prospect_company?: string | null
  contact_name?: string | null
}

export function formatProspectDisplay(analysis: ProspectDisplayInput | null | undefined) {
  const company = analysis?.prospect_company?.trim()
  if (company) return company

  const contact = analysis?.contact_name?.trim()
  if (contact) return contact

  return 'Prospect non identifié'
}
