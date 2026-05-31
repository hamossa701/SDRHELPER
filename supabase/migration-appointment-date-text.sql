-- Store natural-language appointment dates separately from normalized ISO dates.

alter table public.call_analyses
  add column if not exists appointment_date_text text,
  add column if not exists appointment_date_confidence text
    check (appointment_date_confidence in ('high', 'medium', 'low'));

-- Backfill current Praize analyses whose transcripts contain clear relative dates.
update public.call_analyses ca
set
  appointment_date_text = 'mercredi prochain à 15h',
  appointment_datetime = '2026-06-03T15:00:00Z',
  appointment_date_confidence = 'high',
  missing_information = (
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    from jsonb_array_elements_text(ca.missing_information) as item
    where item !~* 'date|horaire|créneau|creneau'
  )
from public.calls c
where c.id = ca.call_id
  and c.id = 'fb9dd590-3239-4d32-b632-6300dd85afe8'
  and ca.appointment_booked = true;

update public.call_analyses ca
set
  appointment_date_text = 'jeudi prochain à 14h',
  appointment_datetime = '2026-06-04T14:00:00Z',
  appointment_date_confidence = 'high',
  missing_information = (
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    from jsonb_array_elements_text(ca.missing_information) as item
    where item !~* 'date|horaire|créneau|creneau'
  )
from public.calls c
where c.id = ca.call_id
  and c.id = '194fccae-1f9d-4f8b-a224-73eedebcbcd1'
  and ca.appointment_booked = true;
