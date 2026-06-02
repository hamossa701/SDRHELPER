import Anthropic from '@anthropic-ai/sdk'
import type { AIAnalysisResponse } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const SYSTEM_PROMPT = `Tu es un expert en analyse de calls B2B de prise de rendez-vous pour des entreprises françaises.
Tu analyses des transcriptions de calls effectués par des SDRs (Sales Development Representatives) marocains travaillant pour des clients français.

MISSION :
Analyser la transcription et retourner un JSON strict avec les informations extraites.

RÈGLES ABSOLUES :
1. Ne jamais inventer d'informations non mentionnées dans la transcription
2. Utiliser null pour toute information absente ou non mentionnée
3. Séparer clairement les FAITS des INTERPRÉTATIONS
4. Scorer de manière réaliste et sévère
5. Signaler clairement les incertitudes dans uncertain_fields
6. Si le call est trop court ou incomplet, signaler via hallucination_risk: "high"
7. decision_maker_detected = true UNIQUEMENT si la personne qui a répondu et parlé dans ce call EST elle-même décisionnaire. Si le SDR cherche à atteindre un décisionnaire mais parle à une secrétaire ou un intermédiaire, decision_maker_detected = false. Un responsable qui gère directement le périmètre discuté (flotte mobile, télécom, IT) et qui s'exprime en son nom propre est considéré décisionnaire même s'il mentionne consulter son équipe ou sa hiérarchie pour validation finale. decision_maker_detected = true si la personne a clairement autorité sur le sujet de l'appel.
8. decision_maker_detected doit toujours être true ou false, jamais null. Si aucun décideur n'a été confirmé ou si le call est trop court pour le déterminer, retourner false.

RÈGLES DE SCORING :

appointment_quality_score (0-100) :
- 0-30 : RDV faible — besoin flou, décideur absent, prochaine étape vague
- 31-60 : RDV acceptable — qualification partielle
- 61-80 : Bon RDV — intérêt réel, prochaine étape claire
- 81-100 : Excellent RDV — décideur confirmé, douleur identifiée, urgence, engagement clair

sdr_quality_score (0-100) :
- Basé sur : structure, écoute active, découverte, traitement objections, clarté, closing

qualification_completeness_score (0-100) :
- Critères : décideur (+20), besoin (+20), urgence (+20), solution actuelle (+20), prochaine étape (+20)

interest_level (cold / warm / hot / unclear) :
- hot : décideur confirmé + douleur concrète identifiée + RDV ferme posé. Budget et urgence financière ne sont PAS obligatoires.
- warm : intérêt exprimé mais RDV non posé, ou décideur non confirmé
- cold : aucun intérêt ou refus clair
- unclear : appel trop court ou interlocuteur non identifié

RETOURNER UNIQUEMENT CE JSON VALIDE, SANS COMMENTAIRE, SANS MARKDOWN :

{
  "call_summary": "Résumé factuel en 2-3 phrases",
  "prospect": {
    "company": null,
    "contact_name": null,
    "contact_role": null,
    "decision_maker_detected": null
  },
  "qualification": {
    "pain_point_detected": null,
    "pain_point_details": null,
    "urgency": null,
    "current_solution": null,
    "interest_level": "cold",
    "objection_detected": false,
    "objection_type": null,
    "objection_details": null,
    "missing_information": []
  },
  "appointment": {
    "appointment_booked": false,
    "appointment_date_text": null,
    "appointment_datetime": null,
    "appointment_date_confidence": null,
    "appointment_quality_score": 0,
    "quality_reason": "Explication courte du score",
    "next_step": null
  },
  "sdr_performance": {
    "sdr_quality_score": 0,
    "qualification_completeness_score": 0,
    "strengths": [],
    "weaknesses": [],
    "coaching_recommendations": []
  },
  "risk_control": {
    "ai_confidence": 0,
    "hallucination_risk": "low",
    "uncertain_fields": []
  }
}`

export interface AIAnalysisResult {
  analysis: AIAnalysisResponse
  inputTokens: number
  outputTokens: number
}

const REQUIRED_ANALYSIS_SECTIONS = ['prospect', 'qualification', 'appointment', 'sdr_performance', 'risk_control'] as const

export class AIAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIAnalysisValidationError'
    Object.setPrototypeOf(this, AIAnalysisValidationError.prototype)
  }
}

function hasObjectSection(value: unknown, key: string) {
  return typeof value === 'object'
    && value !== null
    && key in value
    && typeof (value as Record<string, unknown>)[key] === 'object'
    && (value as Record<string, unknown>)[key] !== null
}

export function validateAIAnalysisShape(value: unknown): string[] {
  return REQUIRED_ANALYSIS_SECTIONS.filter(key => !hasObjectSection(value, key))
}

export function parseAIAnalysisResponse(rawText: string): AIAnalysisResponse {
  const clean = rawText.replace(/```json|```/g, '').trim()
  let parsed: unknown

  try {
    parsed = JSON.parse(clean)
  } catch {
    throw new AIAnalysisValidationError('Reponse IA invalide: JSON malforme')
  }

  const missingSections = validateAIAnalysisShape(parsed)
  if (missingSections.length) {
    throw new AIAnalysisValidationError(`Reponse IA invalide: sections manquantes ${missingSections.join(', ')}`)
  }

  return parsed as AIAnalysisResponse
}

export async function analyzeCallTranscript(
  transcript: string,
  campaignContext?: {
    client_name?: string
    sector?: string
    offer_description?: string
    target_persona?: string
    call_datetime?: string
  }
): Promise<AIAnalysisResult> {
  const contextBlock = campaignContext
    ? `\n\nCONTEXTE CAMPAGNE :
Client : ${campaignContext.client_name || 'Non précisé'}
Secteur : ${campaignContext.sector || 'Non précisé'}
Offre : ${campaignContext.offer_description || 'Non précisée'}
Persona cible : ${campaignContext.target_persona || 'Non précisé'}`
    : ''

  const userMessage = `${contextBlock}

DATE DE REFERENCE DU CALL :
${campaignContext?.call_datetime || 'Non précisée'}

Si une date de RDV est exprimée en langage naturel ("mercredi prochain à 15h", "jeudi 14h"), retourne toujours le texte exact dans appointment.appointment_date_text. Si tu peux normaliser sans ambiguïté avec la date de référence, retourne aussi appointment.appointment_datetime au format ISO 8601. Sinon laisse appointment_datetime à null et mets appointment_date_confidence à "medium" ou "low".

TRANSCRIPTION DU CALL :

${transcript}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Pas de réponse de l\'IA')

  const parsed = parseAIAnalysisResponse(content.text)

  return {
    analysis: parsed,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}
