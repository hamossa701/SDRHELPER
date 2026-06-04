import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function makeClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = makeClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { user_id: user.id, completed_items: [], dismissed_at: null })
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const supabase = makeClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { completed_items?: string[]; dismissed_at?: string | null }
  const payload: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
  if (body.completed_items !== undefined) payload.completed_items = body.completed_items
  if ('dismissed_at' in body) payload.dismissed_at = body.dismissed_at

  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
