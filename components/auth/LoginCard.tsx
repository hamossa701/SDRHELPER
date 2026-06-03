import type { ReactNode } from 'react'
import styles from './LoginCard.module.css'

type LoginCardProps = {
  children: ReactNode
}

export function LoginCard({ children }: LoginCardProps) {
  return (
    <section className={styles.card} aria-labelledby="login-card-title">
      <div className={styles.cardHeader}>
        <div className={styles.badge}>Accès équipe</div>
        <h1 id="login-card-title" className={styles.subtitle}>Accès sécurisé</h1>
      </div>

      {children}

      <div className={styles.cardFooter}>
        <p>Accès réservé aux équipes autorisées.</p>
        <p>Authentification sécurisée.</p>
      </div>
    </section>
  )
}
