# SDRHelper

**Plateforme de supervision IA pour call centers B2B de prise de RDV**

> "Supervisez la qualité de vos RDV sans écouter chaque appel."

Conçu pour les call centers marocains travaillant pour des clients français.

---

## Stack

- **Next.js 14** (App Router + TypeScript)
- **Supabase** (PostgreSQL + Auth + RLS multi-tenant)
- **OpenAI GPT-4o** (analyse transcriptions, JSON mode)
- **Tailwind CSS v4**

## Rôles

| Rôle | Accès |
|---|---|
| `owner` | Vue complète organisation |
| `manager` | Supervision opérationnelle + coaching |
| `sdr` | Ses propres appels + feedback |
| `client` | Reporting campagnes assignées uniquement |

---

## Installation rapide

```bash
git clone https://github.com/hamossa701/SDRHELPER
cd SDRHELPER
npm install
cp .env.local .env.local  # puis remplir les valeurs
```

### Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=https://wabvyfnyrweyucfsbegn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

### Setup Supabase

1. SQL Editor → exécuter `supabase/schema.sql`
2. SQL Editor → exécuter `supabase/seed.sql`
3. Authentication > Users → créer les 6 comptes de démo (voir ci-dessous)
4. Insérer les profils dans la table `users` avec les UUIDs auth

### Comptes de démo

| Email | Mot de passe | Rôle |
|---|---|---|
| karim@callforce.ma | Demo1234! | owner |
| yasmine@callforce.ma | Demo1234! | manager |
| amine@callforce.ma | Demo1234! | sdr |
| sara@callforce.ma | Demo1234! | sdr |
| mehdi@callforce.ma | Demo1234! | sdr |
| pierre@clientcorp.fr | Demo1234! | client |

Après création dans Supabase Auth, insérer dans `public.users` :

```sql
insert into public.users (id, organization_id, name, email, role) values
  ('<UUID_KARIM>',   '11111111-0000-0000-0000-000000000001', 'Karim Benali',     'karim@callforce.ma',   'owner'),
  ('<UUID_YASMINE>', '11111111-0000-0000-0000-000000000001', 'Yasmine Ouazzani', 'yasmine@callforce.ma', 'manager'),
  ('<UUID_AMINE>',   '11111111-0000-0000-0000-000000000001', 'Amine Tazi',       'amine@callforce.ma',   'sdr'),
  ('<UUID_SARA>',    '11111111-0000-0000-0000-000000000001', 'Sara Chaoui',      'sara@callforce.ma',    'sdr'),
  ('<UUID_MEHDI>',   '11111111-0000-0000-0000-000000000001', 'Mehdi Alaoui',     'mehdi@callforce.ma',   'sdr'),
  ('<UUID_PIERRE>',  '11111111-0000-0000-0000-000000000001', 'Pierre Dupont',    'pierre@clientcorp.fr', 'client');

-- Assigner Pierre à la campagne TechSolutions
insert into public.campaign_clients (campaign_id, user_id) values
  ('22222222-0000-0000-0000-000000000001', '<UUID_PIERRE>');
```

```bash
npm run dev
# → http://localhost:3000
```

---

## Pages

| Route | Rôle | Description |
|---|---|---|
| `/login` | tous | Connexion |
| `/dashboard` | owner | Vue d'ensemble org |
| `/manager` | manager | Supervision du jour |
| `/sdr` | sdr | Mon tableau de bord |
| `/client` | client | Rapport campagnes |
| `/campaigns` | owner/manager/sdr | Liste campagnes |
| `/campaigns/new` | owner/manager | Créer campagne |
| `/campaigns/[id]` | selon rôle | Détail campagne |
| `/calls/upload` | owner/manager/sdr | Analyser un appel |
| `/calls/[id]` | selon rôle | Résultat d'analyse |
| `/admin/users` | owner | Gestion équipe |

---

## Analyse IA

GPT-4o analyse les transcriptions françaises et retourne :
- Résumé factuel
- Qualification : prospect, besoin, urgence, décideur
- Détection objections et signaux d'achat
- **Score RDV 0-100** avec explication
- **Score SDR 0-100** basé sur structure, écoute, discovery, closing
- Recommandations coaching personnalisées
- Indicateurs de risque hallucination

---

Projet séparé de H3A CRM.
