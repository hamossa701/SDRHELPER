import Anthropic from '@anthropic-ai/sdk'
import type { AIAnalysisResponse } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `Tu es un expert en analyse de calls B2B de prise de rendez-vous pour des entreprises françaises.
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
    "appointment_datetime": null,
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

export async function analyzeCallTranscript(
  transcript: string,
  campaignContext?: {
    client_name?: string
    sector?: string
    offer_description?: string
    target_persona?: string
  }
): Promise<AIAnalysisResponse> {
  const contextBlock = campaignContext
    ? `\n\nCONTEXTE CAMPAGNE :
Client : ${campaignContext.client_name || 'Non précisé'}
Secteur : ${campaignContext.sector || 'Non précisé'}
Offre : ${campaignContext.offer_description || 'Non précisée'}
Persona cible : ${campaignContext.target_persona || 'Non précisé'}`
    : ''

  const userMessage = `${contextBlock}\n\nTRANSCRIPTION DU CALL :\n\n${transcript}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage }
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Pas de réponse de l\'IA')
  }

  // Clean response - remove any markdown if present
  const clean = content.text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean) as AIAnalysisResponse
  return parsed
}
