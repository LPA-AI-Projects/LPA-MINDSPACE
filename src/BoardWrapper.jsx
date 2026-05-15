import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function Board() {
  const [boardLoaded, setBoardLoaded] = useState(false);

  useEffect(() => {
    // We only load strings from DB
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const userId = session.user.id;

      // Check if board data exists
      const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (!error && data) {
         window.supabaseInitialState = JSON.stringify(data.state);
      }

      // Configure save hook
      window.supabaseStorageSave = async (stateObj) => {
         await supabase.from('boards').upsert({
            user_id: userId,
            state: stateObj
         });
      };
      
      setBoardLoaded(true);
    };

    loadSession();
  }, []);

  useEffect(() => {
    if (!boardLoaded) return;
    
    const script = document.createElement('script');
    script.src = '/board_vanilla.js';
    document.body.appendChild(script);

    return () => { 
      // Safe cleanup
      document.body.removeChild(script); 
      delete window.supabaseStorageSave;
      delete window.supabaseInitialState;
    };
  }, [boardLoaded]);

  // If not loaded yet, don't mount the DOM UI otherwise vanilla fails trying to bind it immediately
  if (!boardLoaded) return <div style={{background:'#141414',height:'100vh',color:'white',display:'flex',justifyContent:'center',alignItems:'center'}}>Loading Board...</div>;

  return (
    <>
      <div id="wrapper-placeholder"></div>
    </>
  );
}
