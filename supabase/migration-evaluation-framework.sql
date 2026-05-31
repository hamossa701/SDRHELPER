-- Internal gold-dataset evaluation framework for owner-only AI validation.

create table if not exists public.evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  transcript text not null,
  expected_decision_maker boolean not null,
  expected_rdv_pose boolean not null,
  expected_rdv_qualifie boolean not null,
  expected_temperature text not null check (expected_temperature in ('cold', 'warm', 'hot', 'unclear')),
  expected_reason text not null,
  category text not null check (category in (
    'qualified_appointment',
    'unqualified_appointment',
    'gatekeeper',
    'voicemail',
    'wrong_contact',
    'budget_objection',
    'competitor_locked',
    'interested_no_meeting',
    'strong_opportunity',
    'no_need'
  )),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now()
);

create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.evaluation_cases(id) on delete cascade,
  run_id uuid not null,
  model text not null,
  actual_decision_maker boolean,
  actual_rdv_pose boolean,
  actual_rdv_qualifie boolean,
  actual_temperature text check (actual_temperature in ('cold', 'warm', 'hot', 'unclear')),
  score integer check (score between 0 and 100),
  passed boolean not null default false,
  mismatches text[] not null default '{}',
  ai_summary text,
  ai_reason text,
  error_message text,
  input_tokens integer,
  output_tokens integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_evaluation_results_case_created
  on public.evaluation_results(case_id, created_at desc);

create index if not exists idx_evaluation_results_run
  on public.evaluation_results(run_id, created_at desc);

alter table public.evaluation_cases enable row level security;
alter table public.evaluation_results enable row level security;

drop policy if exists "evaluation_cases_owner_select" on public.evaluation_cases;
drop policy if exists "evaluation_cases_owner_write" on public.evaluation_cases;
drop policy if exists "evaluation_results_owner_select" on public.evaluation_results;
drop policy if exists "evaluation_results_owner_write" on public.evaluation_results;

create policy "evaluation_cases_owner_select" on public.evaluation_cases
  for select to authenticated
  using (public.get_my_role() = 'owner');

create policy "evaluation_cases_owner_write" on public.evaluation_cases
  for all to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

create policy "evaluation_results_owner_select" on public.evaluation_results
  for select to authenticated
  using (public.get_my_role() = 'owner');

create policy "evaluation_results_owner_write" on public.evaluation_results
  for all to authenticated
  using (public.get_my_role() = 'owner')
  with check (public.get_my_role() = 'owner');

insert into public.evaluation_cases (
  id, title, transcript, expected_decision_maker, expected_rdv_pose,
  expected_rdv_qualifie, expected_temperature, expected_reason, category, difficulty
) values
('10000000-0000-0000-0000-000000000001','DSI pain telecom et RDV confirme',
$$SDR: Bonjour Monsieur Leclerc, vous etes bien DSI chez Groupe Aramis ? Prospect: Oui. SDR: On aide les groupes multi-sites a reduire les coupures fibre et a renegocier les forfaits mobiles. Prospect: Justement nos agences de Lille et Nantes ont des coupures et les factures mobiles explosent. SDR: On peut auditer vos lignes jeudi a 10h avec notre expert telecom ? Prospect: Oui jeudi 10h, envoyez l invitation a mon email.$$,
true,true,true,'hot','Le DSI confirme son role, exprime une douleur multi-sites et accepte un creneau precis.','qualified_appointment','easy'),
('10000000-0000-0000-0000-000000000002','Assistante sans transfert',
$$SDR: Bonjour, je souhaite parler au responsable telecom. Assistante: Il est en reunion toute la journee. SDR: Pouvez-vous me le passer plus tard ? Assistante: Envoyez une plaquette sur contact@entreprise.fr, je ne prends pas de rendez-vous pour lui. SDR: Avez-vous un besoin sur les lignes ? Assistante: Je ne sais pas, je filtre seulement les appels.$$,
false,false,false,'cold','Seule une assistante repond, aucun decideur ni RDV ni besoin confirme.','gatekeeper','easy'),
('10000000-0000-0000-0000-000000000003','Mauvais contact RH',
$$SDR: Bonjour Monsieur Martin, je vous appelle pour vos contrats fibre et mobile. Prospect: Je suis responsable RH, pas du tout les telecoms. SDR: Qui gere cela ? Prospect: Probablement la DAF ou l informatique, mais je n ai pas le nom. Merci de ne pas me relancer sur ce sujet.$$,
false,false,false,'cold','Le contact indique explicitement ne pas etre la bonne personne et ne fournit pas de suite utile.','wrong_contact','easy'),
('10000000-0000-0000-0000-000000000004','RDV avec office manager non decideur',
$$SDR: Vous gerez la telephonie ? Prospect: Je suis office manager, je remonte les soucis mais le DAF signe les contrats. SDR: Vous avez des problemes ? Prospect: Quelques tickets fibre, oui. SDR: On se cale mardi 15h pour comprendre ? Prospect: D accord, mais je ne pourrai pas decider, il faudra convaincre le DAF ensuite.$$,
false,true,false,'warm','Un RDV est pose mais le contact precise que le DAF decide, donc le RDV n est pas qualifie.','unqualified_appointment','medium'),
('10000000-0000-0000-0000-000000000005','Interet fort sans RDV',
$$SDR: Nous optimisons les abonnements mobiles des commerciaux. Prospect: Ca m interesse, on a 80 lignes et je pense qu on paie trop. SDR: Je vous propose un point mercredi. Prospect: Pas maintenant, envoyez-moi les informations et je reviendrai vers vous si le sujet passe en priorite.$$,
true,false,false,'warm','Le prospect semble decideur et interesse, mais refuse de fixer un rendez-vous.','interested_no_meeting','medium'),
('10000000-0000-0000-0000-000000000006','Contrat operateur bloque jusqu en 2028',
$$SDR: Avez-vous une ouverture pour revoir vos contrats telecom ? Prospect: Non, nous avons signe avec Orange Business jusqu a fin 2028, penalites trop elevees. SDR: Meme pour un audit gratuit ? Prospect: Inutile avant 2028, rappelez-nous a ce moment-la.$$,
true,false,false,'cold','Le decideur ferme le sujet a cause d un contrat verrouille jusqu en 2028.','competitor_locked','easy'),
('10000000-0000-0000-0000-000000000007','Gel budget annuel',
$$SDR: On peut reduire vos couts telecom de 15 a 25 %. Prospect: Je suis DAF, donc le sujet m interesse, mais le groupe a gele tous les nouveaux projets jusqu au prochain budget. SDR: On peut anticiper avec un audit ? Prospect: Non, rappelez en janvier, je ne peux valider aucun rendez-vous maintenant.$$,
true,false,false,'cold','Le DAF est decideur mais le gel budget bloque toute demarche et aucun RDV n est pose.','budget_objection','medium'),
('10000000-0000-0000-0000-000000000008','Multi-site incidents et RDV DAF',
$$SDR: Vous avez combien de sites connectes ? Prospect: Douze agences, et deux ont encore des problemes de debit. Je suis DAF et je suis fatigue des factures illisibles. SDR: Nous pouvons faire un diagnostic avec notre consultant vendredi a 14h. Prospect: Oui vendredi 14h, ajoutez aussi mon responsable IT.$$,
true,true,true,'hot','DAF decideur, douleur claire, contexte multi-site et RDV avec participant IT.','strong_opportunity','easy'),
('10000000-0000-0000-0000-000000000009','Demande de rappel sans RDV',
$$SDR: Avez-vous cinq minutes pour parler de vos lignes mobiles ? Prospect: Je suis entre deux reunions, le sujet est pertinent car on recrute des commerciaux. SDR: Je peux vous bloquer un creneau demain ? Prospect: Non, rappelez-moi dans deux semaines, la je ne peux pas regarder mon agenda.$$,
true,false,false,'warm','Il y a un interet mais seulement une demande de rappel, pas un rendez-vous accepte.','interested_no_meeting','medium'),
('10000000-0000-0000-0000-000000000010','Messagerie vocale',
$$Bonjour, vous etes bien sur la messagerie de Claire Dubois, directrice administrative. Je ne suis pas disponible. Laissez un message apres le bip.$$,
false,false,false,'unclear','Message vocal uniquement, aucun jugement de qualification possible.','voicemail','easy'),
('10000000-0000-0000-0000-000000000011','Besoin vague et RDV poli',
$$SDR: On accompagne les PME sur la telephonie cloud. Prospect: Pourquoi pas, je suis gerant mais je n ai pas de probleme particulier. SDR: On peut quand meme faire un point de quinze minutes ? Prospect: Si vous voulez, lundi matin, mais je vous previens qu on ne changera probablement rien.$$,
true,true,false,'cold','RDV pose avec le gerant, mais aucun besoin ni intention reelle ne sont etablis.','unqualified_appointment','hard'),
('10000000-0000-0000-0000-000000000012','Faux positif potentiel date floue',
$$SDR: Vous etes la personne qui valide les contrats mobiles ? Prospect: Oui. SDR: Vos couts sont-ils un sujet ? Prospect: Peut-etre, envoyez une proposition. SDR: On se parle bientot ? Prospect: Oui, on verra ca un de ces jours quand j aurai le temps.$$,
true,false,false,'unclear','La phrase est positive mais aucun creneau ni engagement de RDV n est donne.','interested_no_meeting','hard'),
('10000000-0000-0000-0000-000000000013','Responsable IT interesse mais achat DAF',
$$SDR: Vous gerez l infrastructure telecom ? Prospect: Oui, je suis responsable IT. On a des soucis de VPN sur trois sites. SDR: Vous decidez des fournisseurs ? Prospect: Je recommande, mais le DAF tranche. SDR: On cale jeudi 16h avec vous ? Prospect: Oui, mais sans le DAF ce sera seulement technique.$$,
false,true,false,'warm','Le contact est influent et interesse, mais pas decideur et le RDV n inclut pas le signataire.','unqualified_appointment','hard'),
('10000000-0000-0000-0000-000000000014','Aucun besoin avec decideur',
$$SDR: Bonjour Madame Simon, vous pilotez les achats telecom ? Prospect: Oui. SDR: On aide a reduire les incidents et les couts. Prospect: Nous venons de tout migrer, les utilisateurs sont satisfaits et les couts ont baisse. Je n ai pas de besoin. SDR: Un audit ? Prospect: Non merci.$$,
true,false,false,'cold','Decideur atteint mais absence explicite de besoin et refus du RDV.','no_need','easy'),
('10000000-0000-0000-0000-000000000015','Opportunity hot sans date explicite',
$$SDR: Vos agences ont-elles des problemes de telephonie ? Prospect: Oui, c est critique, je suis directeur operations et je veux regler ca vite. SDR: Je fais intervenir notre expert. Prospect: Tres bien, organisez ca avec mon assistante et mettez-moi dans la boucle rapidement.$$,
true,false,false,'hot','Tres fort besoin mais aucune date ou heure de rendez-vous n est confirmee dans l appel.','strong_opportunity','hard'),
('10000000-0000-0000-0000-000000000016','RDV qualifie avec objections traitees',
$$SDR: Vous etes DAF de Nova Services ? Prospect: Oui. SDR: Vos flottes mobiles sont-elles optimisees ? Prospect: Non, 120 lignes et beaucoup de hors forfait. J ai peur que changer d operateur soit lourd. SDR: Notre audit commence sans migration et chiffre les gains. Prospect: D accord pour mardi 11h avec vous et notre IT.$$,
true,true,true,'hot','DAF decideur, douleur budget claire, objection traitee et RDV date avec IT.','qualified_appointment','medium'),
('10000000-0000-0000-0000-000000000017','Client demande devis sans meeting',
$$SDR: On peut analyser vos factures. Prospect: Je suis responsable achats. Envoyez-moi directement un devis par email. SDR: Pour le devis il faut un point de cadrage. Prospect: Non, pas de reunion. Si le prix est bon, je repondrai.$$,
true,false,false,'warm','Le contact est probablement acheteur mais refuse le rendez-vous, demande seulement un devis.','interested_no_meeting','medium'),
('10000000-0000-0000-0000-000000000018','Standard transfere mauvais service',
$$SDR: Je cherche le responsable telecom. Standard: Je vous passe la comptabilite. Comptabilite: Nous traitons seulement les factures recues, pas les contrats ni les lignes. SDR: Qui peut aider ? Comptabilite: Je ne sais pas, bonne journee.$$,
false,false,false,'cold','Aucun responsable atteint, contact sans pouvoir et sans prochaine etape.','gatekeeper','medium'),
('10000000-0000-0000-0000-000000000019','Decision maker hesitant mais accepte audit',
$$SDR: Vous validez les contrats telecom ? Prospect: Oui, je suis directeur general. SDR: Nous auditons les lignes fibre et mobile. Prospect: Je ne promets rien, mais on a eu assez de coupures pour regarder. SDR: Mercredi prochain 9h ? Prospect: Oui, envoyez l invitation, je veux voir les options.$$,
true,true,true,'hot','DG decideur, douleur reseau et rendez-vous clair malgre prudence.','qualified_appointment','medium'),
('10000000-0000-0000-0000-000000000020','Rappel demande par assistante',
$$SDR: Le dirigeant est disponible pour parler telecom ? Assistante: Non, il me demande de filtrer. SDR: Puis-je caler un point ? Assistante: Rappelez le mois prochain, il regarde peut-etre le sujet, mais je ne peux rien confirmer.$$,
false,false,false,'unclear','Assistante seulement, rappel vague, aucun RDV ni besoin qualifie.','gatekeeper','hard')
on conflict (id) do update set
  title = excluded.title,
  transcript = excluded.transcript,
  expected_decision_maker = excluded.expected_decision_maker,
  expected_rdv_pose = excluded.expected_rdv_pose,
  expected_rdv_qualifie = excluded.expected_rdv_qualifie,
  expected_temperature = excluded.expected_temperature,
  expected_reason = excluded.expected_reason,
  category = excluded.category,
  difficulty = excluded.difficulty;
