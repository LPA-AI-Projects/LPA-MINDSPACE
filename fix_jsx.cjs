const fs = require('fs');

const jsx = `import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import boardHtml from './board.html?raw';

export default function Board() {
  const [boardLoaded, setBoardLoaded] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const userId = session.user.id;
      const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (!error && data) {
         window.supabaseInitialState = JSON.stringify(data.state);
      }

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
      if (document.body.contains(script)) {
         document.body.removeChild(script); 
      }
      delete window.supabaseStorageSave;
      delete window.supabaseInitialState;
    };
  }, [boardLoaded]);

  if (!boardLoaded) return <div style={{background:'#141414',height:'100vh',color:'white',display:'flex',justifyContent:'center',alignItems:'center'}}>Loading Workspace...</div>;

  return (
    <div dangerouslySetInnerHTML={{ __html: boardHtml }} />
  );
}
`;

fs.writeFileSync('src/Board.jsx', jsx);
console.log('Successfully injected string loader');
