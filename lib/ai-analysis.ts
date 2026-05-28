import OpenAI from 'openai'
import type { AIAnalysisResponse } from '@/types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `Tu es un expert en analyse de calls B2B de prise de rendez-vous pour des entreprises françaises.
Tu analyses des transcriptions de calls effectués par des SDRs (Sales Development Representatives) marocains travaillant pour des clients français.

MISSION :
Analyser la transcription et retourner un JSON strict avec les informations extraites.

RÈGLES ABSOLUES :
1. Ne jamais inventer d'informations non mentionnées dans la transcription
2. Utiliser null pour toute information absente ou non mentionnée
3. Utiliser "non mentionné" uniquement dans les champs texte si approprié
4. Séparer clairement les FAITS (dits explicitement) des INTERPRÉTATIONS (déduits)
5. Scorer de manière réaliste et sévère — ne pas surévaluer
6. Signaler clairement les incertitudes dans uncertain_fields
7. Si le call est trop court ou incomplet, le signaler via hallucination_risk: "high"

RÈGLES DE SCORING :

appointment_quality_score (0-100) :
- 0-30 : RDV faible — besoin flou, décideur absent/non confirmé, prochaine étape vague
- 31-60 : RDV acceptable — qualification partielle, intérêt présent mais incomplet
- 61-80 : Bon RDV — intérêt réel, prochaine étape claire, qualification correcte
- 81-100 : Excellent RDV — décideur confirmé, douleur identifiée, urgence présente, engagement clair

sdr_quality_score (0-100) :
- Basé sur : structure du call, écoute active, découverte des besoins, traitement des objections, clarté, closing
- Pénaliser : call trop court, pas de qualification, RDV forcé, mensonge ou pression

qualification_completeness_score (0-100) :
- Critères : décideur identifié (+20), besoin qualifié (+20), urgence explorée (+20), solution actuelle mentionnée (+20), prochaine étape claire (+20)

RETOURNER UNIQUEMENT CE JSON, SANS COMMENTAIRE, SANS MARKDOWN :

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
    "interest_level": "cold|warm|hot|unclear",
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
    "hallucination_risk": "low|medium|high",
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

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  })

  const content = completion.choices[0].message.content
  if (!content) {
    throw new Error('Pas de réponse de l\'IA')
  }

  const parsed = JSON.parse(content) as AIAnalysisResponse
  return parsed
}
