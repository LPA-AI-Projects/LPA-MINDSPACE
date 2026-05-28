import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import boardHtml from './board.html?raw';

function getDisplayName(user) {
  if (!user) return 'Guest';
  const fromMeta = user.user_metadata?.full_name || user.user_metadata?.name;
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split('@')[0];
  return 'User';
}

export default function Board({ session }) {
  const [boardLoaded, setBoardLoaded] = useState(false);
  const boardMountRef = useRef(null);
  const boardHtmlMountedRef = useRef(false);

  useEffect(() => {
    const loadSession = async () => {
      if (!session) return;

      const params = new URLSearchParams(window.location.search);
      const shareBoardId = params.get('board');
      const shareMode = params.get('mode') === 'view' ? 'view' : 'edit';
      const shareToken = params.get('token');
      const userId = session.user.id;
      const userEmail = (session.user.email || '').toLowerCase();
      const userName = getDisplayName(session.user);

      let boardRecord = null;

      if (shareBoardId) {
        const { data } = await supabase
          .from('boards')
          .select('*')
          .eq('id', shareBoardId)
          .single();
        boardRecord = data || null;
      }

      if (!boardRecord) {
        const { data } = await supabase
          .from('boards')
          .select('*')
          .eq('user_id', userId)
          .limit(1);
        boardRecord = data && data.length > 0 ? data[0] : null;
      }

      let boardId = null;
      let canEdit = true;
      if (boardRecord) {
        boardId = boardRecord.id;
        const sharing = boardRecord.state?.sharing || {};
        const invites = Array.isArray(sharing.invites) ? sharing.invites : [];
        const inviteMatch = invites.find((entry) => (entry.email || '').toLowerCase() === userEmail);
        const isOwner = boardRecord.user_id === userId;
        const tokenCanEdit = !!shareToken && shareToken === sharing.editToken;
        const tokenCanView = !!shareToken && shareToken === sharing.viewToken;

        if (shareBoardId) {
          const userCanEditByRole = isOwner || inviteMatch?.permission === 'edit';
          canEdit = (shareMode === 'edit') && (userCanEditByRole || tokenCanEdit);
          const canView = canEdit || tokenCanView || inviteMatch?.permission === 'view' || userCanEditByRole;
          if (!canView) {
            alert('You do not have access to this board.');
            window.location.href = window.location.pathname;
            return;
          }
          if (!canEdit && shareMode !== 'view') {
            const safeUrl = `${window.location.pathname}?board=${encodeURIComponent(boardRecord.id)}&mode=view&token=${encodeURIComponent(sharing.viewToken || '')}`;
            window.history.replaceState({}, '', safeUrl);
          }
        }

        window.supabaseInitialState = JSON.stringify(boardRecord.state || {});
      }

      window.supabaseClient = supabase;
      window.boardAccess = {
        boardId,
        ownerId: boardRecord?.user_id || userId,
        userId,
        userEmail,
        userName,
        canEdit,
      };

      window.supabaseStorageSave = async (stateObj) => {
        if (!canEdit) return;
        if (boardId) {
          await supabase.from('boards').update({ state: stateObj }).eq('id', boardId);
        } else {
          const { data: insertData } = await supabase.from('boards').insert({ user_id: userId, state: stateObj }).select();
          if (insertData && insertData.length > 0) {
            boardId = insertData[0].id;
            window.boardAccess.boardId = boardId;
          }
        }
      };

      setBoardLoaded(true);
    };

    loadSession();
  }, [session]);

  useEffect(() => {
    if (!boardLoaded) return;

    const script = document.createElement('script');
    const buildId = import.meta.env.VITE_BUILD_ID || '';
    script.src = buildId ? `/board_vanilla.js?v=${buildId}` : '/board_vanilla.js';
    document.body.appendChild(script);

    return () => { 
      if (document.body.contains(script)) {
         document.body.removeChild(script); 
      }
      delete window.supabaseClient;
      delete window.boardAccess;
      delete window.supabaseStorageSave;
      delete window.supabaseInitialState;
    };
  }, [boardLoaded]);

  // Mount shell HTML once — re-running dangerouslySetInnerHTML on every render
  // (e.g. after Supabase TOKEN_REFRESHED on tab focus) wipes the canvas DOM.
  useEffect(() => {
    if (!boardLoaded || !boardMountRef.current || boardHtmlMountedRef.current) return;
    boardMountRef.current.innerHTML = boardHtml;
    boardHtmlMountedRef.current = true;
  }, [boardLoaded]);

  if (!boardLoaded) {
    return (
      <div style={{ background: '#141414', height: '100vh', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        Loading Workspace...
      </div>
    );
  }

  return <div ref={boardMountRef} className="board-shell" />;
}
