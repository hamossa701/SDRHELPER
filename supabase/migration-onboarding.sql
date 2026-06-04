-- Migration: onboarding_progress
-- Run once in Supabase SQL editor

CREATE TABLE public.onboarding_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  completed_items text[] NOT NULL DEFAULT '{}',
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_progress_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_select_own"
  ON public.onboarding_progress FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "onboarding_insert_own"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "onboarding_update_own"
  ON public.onboarding_progress FOR UPDATE
  USING (user_id = auth.uid());
