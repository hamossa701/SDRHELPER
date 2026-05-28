import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { analyzeCallTranscript } from '@/lib/ai-analysis'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Auth check
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 401 })
    }

    const body = await request.json()
    const { campaign_id, sdr_id, transcript, call_datetime } = body

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'Transcription requise' }, { status: 400 })
    }
    if (!campaign_id || !sdr_id) {
      return NextResponse.json({ error: 'Campagne et SDR requis' }, { status: 400 })
    }

    // Verify campaign belongs to org
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
    }

    // Insert call
    const { data: call, error: callErr } = await supabase
      .from('calls')
      .insert({
        organization_id: profile.organization_id,
        campaign_id,
        sdr_id,
        transcript: transcript.trim(),
        call_datetime: call_datetime || new Date().toISOString(),
      })
      .select()
      .single()

    if (callErr || !call) {
      return NextResponse.json({ error: 'Erreur lors de la création de l\'appel' }, { status: 500 })
    }

    // Run AI analysis
    const analysis = await analyzeCallTranscript(transcript, {
      client_name: campaign.client_name,
      sector: campaign.sector,
      offer_description: campaign.offer_description,
      target_persona: campaign.target_persona,
    })

    // Store analysis
    const { error: analysisErr } = await supabase
      .from('call_analyses')
      .insert({
        call_id: call.id,
        call_summary: analysis.call_summary,

        prospect_company: analysis.prospect.company,
        contact_name: analysis.prospect.contact_name,
        contact_role: analysis.prospect.contact_role,
        decision_maker_detected: analysis.prospect.decision_maker_detected,

        pain_point_detected: analysis.qualification.pain_point_detected,
        pain_point_details: analysis.qualification.pain_point_details,
        urgency: analysis.qualification.urgency,
        current_solution: analysis.qualification.current_solution,
        interest_level: analysis.qualification.interest_level,
        objection_detected: analysis.qualification.objection_detected,
        objection_type: analysis.qualification.objection_type,
        objection_details: analysis.qualification.objection_details,
        missing_information: analysis.qualification.missing_information,

        appointment_booked: analysis.appointment.appointment_booked,
        appointment_datetime: analysis.appointment.appointment_datetime,
        appointment_quality_score: analysis.appointment.appointment_quality_score,
        appointment_quality_reason: analysis.appointment.quality_reason,
        next_step: analysis.appointment.next_step,

        sdr_quality_score: analysis.sdr_performance.sdr_quality_score,
        qualification_completeness_score: analysis.sdr_performance.qualification_completeness_score,
        strengths: analysis.sdr_performance.strengths,
        weaknesses: analysis.sdr_performance.weaknesses,
        coaching_recommendations: analysis.sdr_performance.coaching_recommendations,

        ai_confidence: analysis.risk_control.ai_confidence,
        hallucination_risk: analysis.risk_control.hallucination_risk,
        uncertain_fields: analysis.risk_control.uncertain_fields,

        human_validated: false,
      })

    if (analysisErr) {
      console.error('Analysis insert error:', analysisErr)
      // Call was created, return it even if analysis failed
    }

    return NextResponse.json({ call_id: call.id })

  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
