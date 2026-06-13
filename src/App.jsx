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
      // Token refresh on tab focus must not re-render Board (that wiped the canvas).
      if (event === 'TOKEN_REFRESHED') return;
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
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

    // Full page load so Supabase auth + session board load in the correct order.
    if (sessionSlug) {
      window.location.replace(buildSessionUrl(sessionSlug))
      return
    }

    setLoading(false)
  }

  if (loading) {
     return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',color:'#fff',background:'#141414'}}>Loading...</div>
  }

  if (!session) {
    const pathSession = getSessionIdFromPath()
    return (
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#141414',color:'#fbfbfb',fontFamily:'sans-serif'}}>
        <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:12,padding:32,background:'#1e1e1e',borderRadius:12,border:'1px solid #333',maxWidth:360,width:'100%'}}>
          <h2 style={{margin:0,marginBottom:4}}>Log into MindSpace</h2>
          {pathSession ? (
            <p style={{margin:0,fontSize:14,color:'#9ca3af'}}>
              Joining session: <strong style={{color:'#2e9d91'}}>/{pathSession}</strong>
            </p>
          ) : null}
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            style={{padding:12,borderRadius:6,border:'1px solid #444',background:'#141414',color:'#fff'}}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            style={{padding:12,borderRadius:6,border:'1px solid #444',background:'#141414',color:'#fff'}}
            required
          />
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <label htmlFor="join-session" style={{fontSize:13,color:'#9ca3af'}}>
              Session name {pathSession ? '(from link)' : '(optional)'}
            </label>
            <input
              id="join-session"
              type="text"
              placeholder="e.g. training-june-03"
              value={joinSession}
              onChange={e => setJoinSession(e.target.value)}
              readOnly={!!pathSession}
              style={{
                padding:12,
                borderRadius:6,
                border:'1px solid #444',
                background: pathSession ? '#1a1a1a' : '#141414',
                color:'#fff',
                opacity: pathSession ? 0.9 : 1,
              }}
            />
            <span style={{fontSize:12,color:'#6b7280'}}>
              Leave blank to open your personal board, or enter a name to join a training session.
            </span>
          </div>
          <button type="submit" style={{padding:12,borderRadius:6,background:'#2e9d91',color:'#fff',border:'none',fontWeight:'bold',cursor:'pointer'}}>
            {pathSession ? 'Log in & join session' : joinSession.trim() ? 'Log in & join session' : 'Log in'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <>
      <Board session={session} />
    </>
  )
}

export default App
