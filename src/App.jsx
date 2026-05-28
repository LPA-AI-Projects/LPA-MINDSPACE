import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Board from './Board'
import './index.css'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refresh on tab focus must not re-render Board (that wiped the canvas).
      if (event === 'TOKEN_REFRESHED') return;
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
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
    }
    setLoading(false)
  }

  if (loading) {
     return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',color:'#fff',background:'#141414'}}>Loading...</div>
  }

  if (!session) {
    return (
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#141414',color:'#fbfbfb',fontFamily:'sans-serif'}}>
        <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:12,padding:32,background:'#1e1e1e',borderRadius:12,border:'1px solid #333'}}>
          <h2 style={{margin:0,marginBottom:12}}>Log into Workspace</h2>
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            style={{padding:12,borderRadius:6,border:'1px solid #444',background:'#141414',color:'#fff',width:300}}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            style={{padding:12,borderRadius:6,border:'1px solid #444',background:'#141414',color:'#fff',width:300}}
            required
          />
          <button type="submit" style={{padding:12,borderRadius:6,background:'#2e9d91',color:'#fff',border:'none',fontWeight:'bold',cursor:'pointer'}}>
            Login / Auto-Signup
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
