-- ============================================================
-- SDRHelper - Seed Data
-- Run AFTER schema.sql
-- Creates demo data for showcasing the product
-- ============================================================

-- NOTE: You must first create auth users manually in Supabase Auth
-- or via the Supabase dashboard with these emails, then run this seed.
-- Passwords: Demo1234! for all demo users

-- Step 1: Create Organization
insert into public.organizations (id, name, plan) values
  ('11111111-0000-0000-0000-000000000001', 'CallForce Maroc', 'pro');

-- Step 2: Insert users (assumes auth.users already created with same IDs)
-- Replace these UUIDs with actual auth.users IDs after creating them in Supabase Auth
-- These are placeholders — see README for how to seed properly

-- For demo purposes, we use a stored procedure approach
-- Run this after creating auth accounts:

/*
insert into public.users (id, organization_id, name, email, role) values
  ('AUTH_UUID_OWNER',   '11111111-0000-0000-0000-000000000001', 'Karim Benali',     'karim@callforce.ma',  'owner'),
  ('AUTH_UUID_MANAGER', '11111111-0000-0000-0000-000000000001', 'Yasmine Ouazzani', 'yasmine@callforce.ma','manager'),
  ('AUTH_UUID_SDR1',    '11111111-0000-0000-0000-000000000001', 'Amine Tazi',        'amine@callforce.ma',  'sdr'),
  ('AUTH_UUID_SDR2',    '11111111-0000-0000-0000-000000000001', 'Sara Chaoui',       'sara@callforce.ma',   'sdr'),
  ('AUTH_UUID_SDR3',    '11111111-0000-0000-0000-000000000001', 'Mehdi Alaoui',      'mehdi@callforce.ma',  'sdr'),
  ('AUTH_UUID_CLIENT',  '11111111-0000-0000-0000-000000000001', 'Pierre Dupont',     'pierre@clientcorp.fr','client');
*/

-- Step 3: Campaigns
insert into public.campaigns (id, organization_id, client_name, campaign_name, sector, target_persona, offer_description, script_notes, status) values
  (
    '22222222-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'TechSolutions France',
    'Prospection DSI PME Île-de-France',
    'Logiciels B2B / SaaS',
    'DSI ou Directeur IT dans entreprises 50-500 salariés',
    'Solution de gestion documentaire cloud, réduction 40% temps traitement, conformité RGPD',
    'Ouvrir sur problématique archivage papier. Qualifier budget Q1. Éviter parler prix avant RDV.',
    'active'
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'EnergyPro SAS',
    'Audit énergétique ETI',
    'Industrie / Énergie',
    'DAF ou Responsable Énergie dans industrie 200+ salariés',
    'Audit énergétique gratuit + plan d''optimisation, économies moyennes 15-30% sur facture',
    'Mettre en avant la gratuité de l''audit. Qualifier si propriétaire des locaux. Poser question facture actuelle.',
    'active'
  ),
  (
    '22222222-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    'FleetManager Pro',
    'Gestion de flotte PME',
    'Transport / Logistique',
    'Responsable de parc ou Gérant dans PME avec 10+ véhicules',
    'Logiciel gestion flotte + télématique, réduction coûts carburant 20%, suivi temps réel',
    'Valider nombre de véhicules dès le début. Qualifier si gestion actuelle est manuelle ou logiciel concurrent.',
    'paused'
  );

-- Sample calls and analyses are inserted via the app or manually
-- See /supabase/sample-calls.sql for realistic call transcript examples
