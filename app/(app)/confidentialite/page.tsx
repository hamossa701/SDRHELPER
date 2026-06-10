export default function ConfidentialitePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="app-page-header" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--border)', height: 56, padding: '0 24px', display: 'flex', alignItems: 'center', flexShrink: 0, backdropFilter: 'blur(18px)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Politique de confidentialité</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Traitement des données personnelles — RGPD</div>
        </div>
      </div>

      <div className="app-scroll">
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>1. Données collectées</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 10 }}>
              Dans le cadre de l&apos;utilisation de SDR Helper, les données suivantes sont collectées et traitées :
            </p>
            <ul style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: 'var(--text)' }}>Enregistrements audio d&apos;appels</strong> — fichiers audio des appels téléphoniques transmis via Ringover ou importés manuellement.</li>
              <li><strong style={{ color: 'var(--text)' }}>Transcriptions</strong> — texte généré automatiquement à partir des enregistrements audio par AssemblyAI.</li>
              <li><strong style={{ color: 'var(--text)' }}>Analyses IA</strong> — résultats extraits des transcriptions par le modèle d&apos;intelligence artificielle (Anthropic Claude).</li>
              <li><strong style={{ color: 'var(--text)' }}>Données de compte</strong> — nom, adresse e-mail et rôle des utilisateurs de la plateforme.</li>
            </ul>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>2. Sous-traitants (sous-processeurs)</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 12 }}>
              Les données sont traitées par les sous-traitants suivants :
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                ['Supabase',   'Base de données et authentification',         'Union Européenne'],
                ['Vercel',     'Hébergement applicatif',                       'UE / États-Unis (Edge Network)'],
                ['AssemblyAI', 'Transcription automatique de la parole',       'États-Unis'],
                ['Anthropic',  'Analyse par intelligence artificielle',        'États-Unis'],
                ['Ringover',   'Téléphonie et enregistrements (optionnel)',    'Union Européenne'],
              ] as const).map(([name, role, region]) => (
                <div key={name} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{role}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{region}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>3. Durée de conservation</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              Les enregistrements audio et transcriptions sont conservés pendant la durée définie par votre organisation (par défaut <strong style={{ color: 'var(--text)' }}>365 jours</strong> à compter de la date de l&apos;appel). Passé ce délai, les fichiers audio sont supprimés et les transcriptions sont anonymisées automatiquement.
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginTop: 10 }}>
              Les analyses IA et données agrégées (scores, statistiques) peuvent être conservées au-delà de cette période à des fins de suivi de performance, sous forme anonymisée.
            </p>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>4. Droits des personnes concernées</h2>
            <p style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.7, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '10px 14px' }}>
              [PLACEHOLDER — droits d&apos;accès, rectification, suppression, portabilité, opposition. À compléter par le responsable juridique.]
            </p>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>5. Contact</h2>
            <p style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.7, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '10px 14px' }}>
              [PLACEHOLDER — adresse e-mail du responsable du traitement / DPO. À compléter avant mise en production.]
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
