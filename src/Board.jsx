import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import boardHtml from './board.html?raw';
import { buildSessionUrl, resolveSessionId } from './sessionRoutes';

const EDIT_ROLES = new Set(['facilitator', 'participant']);

function getDisplayName(user) {
  if (!user) return 'Guest';
  const fromMeta = user.user_metadata?.full_name || user.user_metadata?.name;
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split('@')[0];
  return 'User';
}

function getBoardAccess(boardRecord, userId, userEmail, shareToken, shareMode) {
  const sharing = boardRecord?.state?.sharing || {};
  const invites = Array.isArray(sharing.invites) ? sharing.invites : [];
  const inviteMatch = invites.find((entry) => (entry.email || '').toLowerCase() === userEmail);
  const isOwner = boardRecord?.user_id === userId;
  const tokenCanEdit = !!shareToken && shareToken === sharing.editToken;
  const tokenCanView = !!shareToken && shareToken === sharing.viewToken;
  const userCanEditByRole = isOwner || inviteMatch?.permission === 'edit';
  const canEdit = (shareMode === 'edit') && (userCanEditByRole || tokenCanEdit);
  const canView = canEdit || tokenCanView || inviteMatch?.permission === 'view' || userCanEditByRole;
  return { canView, canEdit };
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const rawBoardId = params.get('board');
  const shareBoardId = rawBoardId && /^\d+$/.test(rawBoardId) ? rawBoardId : null;
  return {
    sessionId: resolveSessionId(window.location.pathname, window.location.search),
    shareBoardId,
    shareMode: params.get('mode') === 'view' ? 'view' : 'edit',
    shareToken: params.get('token'),
  };
}

async function fetchBoardById(boardId) {
  if (boardId == null || boardId === '') return null;
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .maybeSingle();
  if (error) {
    logSessionError('load board', error);
    return null;
  }
  return data || null;
}

function logSessionError(step, error) {
  if (error) console.error(`[session] ${step}:`, error.message || error);
}

async function loadSessionScopedBoard(sessionId, userId) {
  if (!sessionId) return null;
  try {
    const { data: sessionRowInitial, error: sessionLookupError } = await supabase
      .from('sessions')
      .select('id, board_id, created_by, facilitator_ids, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionLookupError) {
      logSessionError('lookup session', sessionLookupError);
      return null;
    }

    let sessionRow = sessionRowInitial;

    // Create reusable session on first access (creator becomes facilitator).
    if (!sessionRow) {
      const { data: bootstrapped, error: bootstrapError } = await supabase.rpc(
        'bootstrap_training_session',
        { p_session_id: sessionId },
      );
      const bootstrapRow = Array.isArray(bootstrapped) ? bootstrapped[0] : bootstrapped;
      if (bootstrapError || !bootstrapRow?.board_id) {
        logSessionError('bootstrap session', bootstrapError);
        return null;
      }
      sessionRow = {
        id: bootstrapRow.session_id || sessionId,
        board_id: bootstrapRow.board_id,
        created_by: bootstrapRow.created_by,
        facilitator_ids: bootstrapRow.facilitator_ids,
        status: bootstrapRow.status,
      };
    }

    if (!sessionRow?.board_id) return null;

    const facilitatorIds = Array.isArray(sessionRow.facilitator_ids) ? sessionRow.facilitator_ids : [];
    const defaultRole = sessionRow.created_by === userId || facilitatorIds.includes(userId)
      ? 'facilitator'
      : 'participant';

    const { data: participantInitial, error: participantLookupError } = await supabase
      .from('session_participants')
      .select('role, can_override_workspace')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (participantLookupError) {
      logSessionError('lookup participant', participantLookupError);
      return null;
    }

    let participant = participantInitial;

    if (!participant) {
      const { data: inserted, error: participantInsertError } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: userId,
          role: defaultRole,
          can_override_workspace: defaultRole === 'facilitator',
        })
        .select('role, can_override_workspace')
        .single();
      if (participantInsertError) {
        logSessionError('create participant', participantInsertError);
        return null;
      }
      participant = inserted || { role: defaultRole, can_override_workspace: defaultRole !== 'participant' };
    } else {
      // Keep lightweight heartbeat for activity panel.
      supabase
        .from('session_participants')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('user_id', userId);
    }

    // Board RLS requires session membership — fetch only after participant row exists.
    const boardRecord = await fetchBoardById(sessionRow.board_id);
    if (!boardRecord) {
      logSessionError('load board', new Error(`board ${sessionRow.board_id} not accessible after join`));
      return null;
    }

    return {
      boardRecord,
      sessionRow,
      role: participant?.role || defaultRole,
      canOverrideWorkspace: !!participant?.can_override_workspace,
    };
  } catch (err) {
    logSessionError('load session scoped board', err);
    return null;
  }
}

async function loadSessionScopedBoardWithRetry(sessionId, userId, attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    await supabase.auth.getSession();
    const result = await loadSessionScopedBoard(sessionId, userId);
    if (result) return result;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (i + 1)));
    }
  }
  return null;
}

export default function Board({ session }) {
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const boardMountRef = useRef(null);
  const boardHtmlMountedRef = useRef(false);
  const currentBoardIdRef = useRef(null);
  const currentSessionIdRef = useRef(null);

  useEffect(() => {
    const loadSession = async () => {
      if (!session) return;
      setLoadError('');
      setBoardLoaded(false);

      const { sessionId, shareBoardId, shareMode, shareToken } = getQueryParams();
      const userId = session.user.id;
      const userEmail = (session.user.email || '').toLowerCase();
      const userName = getDisplayName(session.user);

      let boardRecord = null;
      let role = 'participant';
      let canOverrideWorkspace = false;
      let resolvedSessionId = sessionId || null;
      const lastBoardId = localStorage.getItem('lpa-last-board-id');
      const lastSessionId = localStorage.getItem('lpa-last-session-id');

      if (sessionId) {
        const sessionScoped = await loadSessionScopedBoardWithRetry(sessionId, userId);
        if (!sessionScoped) {
          setLoadError('Could not join this session yet. Please refresh the page or try again in a moment.');
          return;
        }
        boardRecord = sessionScoped.boardRecord;
        role = sessionScoped.role;
        canOverrideWorkspace = sessionScoped.canOverrideWorkspace;
        resolvedSessionId = sessionScoped.sessionRow.id;
      } else {
        const sessionScoped = await loadSessionScopedBoardWithRetry(lastSessionId, userId);
        if (sessionScoped) {
          boardRecord = sessionScoped.boardRecord;
          role = sessionScoped.role;
          canOverrideWorkspace = sessionScoped.canOverrideWorkspace;
          resolvedSessionId = sessionScoped.sessionRow.id;
        }
      }

      if (!boardRecord && shareBoardId) {
        boardRecord = await fetchBoardById(shareBoardId);
      }

      if (!boardRecord && lastBoardId && /^\d+$/.test(lastBoardId)) {
        boardRecord = await fetchBoardById(lastBoardId);
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
        currentBoardIdRef.current = boardId;
        currentSessionIdRef.current = resolvedSessionId;
        localStorage.setItem('lpa-last-board-id', boardId);
        if (resolvedSessionId) localStorage.setItem('lpa-last-session-id', resolvedSessionId);

        // Canonical URL: /session-slug (legacy ?session= links are rewritten).
        if (!shareBoardId && resolvedSessionId) {
          const desired = buildSessionUrl(resolvedSessionId, { boardId, mode: 'edit' });
          const current = `${window.location.pathname}${window.location.search}`;
          if (current !== desired) {
            window.history.replaceState({}, '', desired);
          }
        }

        if (resolvedSessionId) {
          canEdit = EDIT_ROLES.has(role);
        } else if (shareBoardId) {
          const { canView, canEdit: shareCanEdit } = getBoardAccess(
            boardRecord,
            userId,
            userEmail,
            shareToken,
            shareMode,
          );
          canEdit = shareCanEdit;
          if (!canView) {
            alert('You do not have access to this board.');
            window.location.href = window.location.pathname;
            return;
          }
          if (!canEdit && shareMode !== 'view') {
            const sharing = boardRecord.state?.sharing || {};
            const safeUrl = `${window.location.pathname}?board=${encodeURIComponent(boardRecord.id)}&mode=view&token=${encodeURIComponent(sharing.viewToken || '')}`;
            window.history.replaceState({}, '', safeUrl);
          }
        }

        window.supabaseInitialState = JSON.stringify(boardRecord.state || {});
      }

      window.supabaseClient = supabase;
      window.boardAccess = {
        boardId,
        sessionId: resolvedSessionId,
        role,
        canOverrideWorkspace,
        ownerId: boardRecord?.user_id || userId,
        userId,
        userEmail,
        userName,
        canEdit,
      };

      window.supabaseStorageSave = async (stateObj) => {
        if (!canEdit) return;
        if (boardId) {
          const { error } = await supabase.from('boards').update({ state: stateObj }).eq('id', boardId);
          if (error) console.error('[board] Supabase state save failed', error.message);
        } else {
          const { data: insertData, error } = await supabase.from('boards').insert({ user_id: userId, state: stateObj }).select();
          if (error) console.error('[board] Supabase state insert failed', error.message);
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
    const params = new URLSearchParams(window.location.search);
    const hasSessionInUrl = !!resolveSessionId(window.location.pathname, window.location.search);
    const hasBoardInUrl = !!params.get('board');
    const mode = params.get('mode') || 'edit';
    // Only auto-follow board switches for the main board tab.
    if (!boardLoaded || hasSessionInUrl || hasBoardInUrl) return;

    const onStorage = (e) => {
      if (e.key !== 'lpa-last-session-id' || !e.newValue) return;
      const nextSessionId = e.newValue;
      if (nextSessionId === currentSessionIdRef.current) return;
      window.location.assign(buildSessionUrl(nextSessionId, { mode }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [boardLoaded]);

  useEffect(() => {
    if (!boardLoaded) return;

    const script = document.createElement('script');
    const buildId = import.meta.env.VITE_BUILD_ID || (import.meta.env.DEV ? 'dev' : '');
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

  if (loadError) {
    return (
      <div style={{ background: '#141414', height: '100vh', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <p style={{ marginBottom: 16 }}>{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 16px', borderRadius: 6, background: '#2e9d91', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }

  if (!boardLoaded) {
    return (
      <div style={{ background: '#141414', height: '100vh', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        Loading Workspace...
      </div>
    );
  }

  return <div ref={boardMountRef} className="board-shell" />;
}
