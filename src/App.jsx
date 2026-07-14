import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Board from './Board'
import {
  buildSessionUrl,
  getSessionIdFromPath,
  normalizeSessionSlug,
} from './sessionRoutes'
import { isTrainerEmail, TRAINER_LOGIN_HINT } from './trainerAuth'
import './index.css'

const CREATE_INTENT_KEY = 'lpa-session-create-intent'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [joinSession, setJoinSession] = useState(() => getSessionIdFromPath() || '')
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') return
      setSession((prev) => {
        if (!nextSession) return null
        if (prev?.user?.id === nextSession.user?.id) return prev
        return nextSession
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setFormError('')
    setLoading(true)

    const pathSession = getSessionIdFromPath()
    const sessionSlug = normalizeSessionSlug(joinSession) || pathSession
    const normalizedEmail = (email || '').trim().toLowerCase()
    const isStudentJoin = !!pathSession
    const trainerLogin = !isStudentJoin

    // Trainer home login: shared trainer account + mandatory Batch ID.
    if (trainerLogin) {
      if (!sessionSlug) {
        setFormError('Enter a Session ID / Batch ID to continue.')
        setLoading(false)
        return
      }
      if (!isTrainerEmail(normalizedEmail)) {
        setFormError(`Only the shared trainer account can open or create sessions. ${TRAINER_LOGIN_HINT}`)
        setLoading(false)
        return
      }
      localStorage.setItem(CREATE_INTENT_KEY, sessionSlug)
    } else {
      // Students join via share link — never auto-create a missing session.
      localStorage.removeItem(CREATE_INTENT_KEY)
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) {
      localStorage.removeItem(CREATE_INTENT_KEY)

      // Trainers use a pre-created shared account — no self-signup on trainer flow.
      if (trainerLogin) {
        setFormError(
          error.message.includes('Invalid login credentials')
            ? 'Invalid trainer email or password. Use the shared trainer account from your admin.'
            : error.message,
        )
        setLoading(false)
        return
      }

      // Students may sign up on first join.
      if (error.message.includes('Invalid login credentials')) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        })
        if (signUpError) {
          alert(signUpError.message)
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
          alert('Email already in use, or please check your inbox for confirmation link.')
        } else {
          alert('Signup successful! Check your email to confirm, OR disable "Confirm Email" in your Supabase Auth dashboard.')
        }
      } else {
        alert(error.message)
      }
      setLoading(false)
      return
    }

    // Defense-in-depth: signed-in user on trainer path must be an allowlisted trainer.
    if (trainerLogin && !isTrainerEmail(normalizedEmail)) {
      await supabase.auth.signOut()
      localStorage.removeItem(CREATE_INTENT_KEY)
      setFormError(`Only the shared trainer account can open sessions. ${TRAINER_LOGIN_HINT}`)
      setLoading(false)
      return
    }

    if (sessionSlug) {
      window.location.replace(buildSessionUrl(sessionSlug))
      return
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-loader" role="status" aria-live="polite">
          <div className="app-loader-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M3 13L8 3L13 13" stroke="#fbfbfb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9.5h6" stroke="#fbfbfb" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="app-loader-text">Loading MindSpace…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    const pathSession = getSessionIdFromPath()
    const isStudentJoin = !!pathSession
    const ctaLabel = isStudentJoin
      ? 'Log in & join session'
      : 'Trainer log in'

    return (
      <div className="auth-page">
        <aside className="auth-hero" aria-hidden="true">
          <div className="auth-hero-grid" />
          <div className="auth-hero-glow auth-hero-glow--teal" />
          <div className="auth-hero-glow auth-hero-glow--blue" />
          <div className="auth-hero-glow auth-hero-glow--orange" />
          <div className="auth-hero-content">
            <div className="auth-hero-logo">
              <div className="lp-brand-logo lp-brand-logo--hero" role="img" aria-label="Learners Point" />
            </div>
            <h1 className="auth-hero-title">Collaborative training boards for modern teams</h1>
            <p className="auth-hero-desc">
              Facilitate live sessions, brainstorm on an infinite canvas, and guide participants in real time.
            </p>
            <ul className="auth-hero-features">
              <li><span className="auth-dot auth-dot--teal" />Live session boards</li>
              <li><span className="auth-dot auth-dot--blue" />Real-time collaboration</li>
              <li><span className="auth-dot auth-dot--orange" />Facilitator tools</li>
            </ul>
          </div>
        </aside>

        <main className="auth-main">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Welcome back</h2>
              <p>
                {isStudentJoin
                  ? 'Sign in to join the shared training session.'
                  : 'Trainers: use the shared trainer account plus a Session ID / Batch ID.'}
              </p>
            </div>

            {pathSession ? (
              <div className="auth-session-badge">
                <span className="auth-session-badge-label">Joining session</span>
                <span className="auth-session-badge-slug">/{pathSession}</span>
              </div>
            ) : null}

            <form className="auth-form" onSubmit={handleLogin}>
              <div className="auth-field">
                <label htmlFor="auth-email">
                  {isStudentJoin ? 'Email' : 'Trainer email'}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder={isStudentJoin ? 'you@company.com' : 'trainer@learnerspoint.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                {!isStudentJoin ? (
                  <span className="auth-field-hint">{TRAINER_LOGIN_HINT}</span>
                ) : null}
              </div>

              <div className="auth-field">
                <label htmlFor="join-session">
                  {isStudentJoin ? 'Session ID / Batch ID (from link)' : 'Session ID / Batch ID'}
                </label>
                <input
                  id="join-session"
                  type="text"
                  placeholder="e.g. sales-batch-12"
                  value={joinSession}
                  onChange={(e) => setJoinSession(e.target.value)}
                  readOnly={isStudentJoin}
                  required={!isStudentJoin}
                  className={isStudentJoin ? 'is-readonly' : ''}
                />
                <span className="auth-field-hint">
                  {isStudentJoin
                    ? 'You are joining via a trainer share link.'
                    : 'Required. New ID creates a board; existing ID opens that batch board.'}
                </span>
              </div>

              {formError ? <p className="auth-form-error">{formError}</p> : null}

              <button type="submit" className="auth-submit" disabled={loading}>
                {ctaLabel}
              </button>
            </form>
          </div>

          <p className="auth-footer">LP MindSpace · Internal training workspace</p>
        </main>
      </div>
    )
  }

  return <Board session={session} />
}

export default App
