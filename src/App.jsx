import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Board from './Board'
import {
  buildSessionUrl,
  getSessionIdFromPath,
  normalizeSessionSlug,
} from './sessionRoutes'
import './index.css'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [joinSession, setJoinSession] = useState(() => getSessionIdFromPath() || '')
  const [loading, setLoading] = useState(true)

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
    setLoading(true)

    const pathSession = getSessionIdFromPath()
    const sessionSlug = normalizeSessionSlug(joinSession) || pathSession

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
         const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
         if (signUpError) {
             alert(signUpError.message)
         } else {
             if (data.user && data.user.identities && data.user.identities.length === 0) {
                 alert("Email already in use, or please check your inbox for confirmation link.")
             } else {
                 alert('Signup successful! Check your email to confirm, OR disable "Confirm Email" in your Supabase Auth dashboard.')
             }
         }
      } else {
         alert(error.message)
      }
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
    const ctaLabel = pathSession || joinSession.trim()
      ? 'Log in & join session'
      : 'Log in'

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
              <p>Sign in to open your workspace or join a training session.</p>
            </div>

            {pathSession ? (
              <div className="auth-session-badge">
                <span className="auth-session-badge-label">Joining session</span>
                <span className="auth-session-badge-slug">/{pathSession}</span>
              </div>
            ) : null}

            <form className="auth-form" onSubmit={handleLogin}>
              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder="you@company.com"
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
              </div>

              <div className="auth-field">
                <label htmlFor="join-session">
                  Session name {pathSession ? '(from link)' : '(optional)'}
                </label>
                <input
                  id="join-session"
                  type="text"
                  placeholder="e.g. training-june-03"
                  value={joinSession}
                  onChange={(e) => setJoinSession(e.target.value)}
                  readOnly={!!pathSession}
                  className={pathSession ? 'is-readonly' : ''}
                />
                <span className="auth-field-hint">
                  Leave blank for your personal board, or enter a name to join a session.
                </span>
              </div>

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
