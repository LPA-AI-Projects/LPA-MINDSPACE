import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import boardHtml from './board.html?raw';
import './index.css';
import { buildSessionUrl, resolveSessionId } from './sessionRoutes';
import { isTrainerEmail } from './trainerAuth';

const EDIT_ROLES = new Set(['facilitator', 'participant']);
const CREATE_INTENT_KEY = 'lpa-session-create-intent';
const CLOSED_STATUSES = new Set(['closed', 'ended', 'archived']);

function isSessionClosed(status) {
  return CLOSED_STATUSES.has(String(status || '').toLowerCase());
}

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

async function loadSessionScopedBoard(sessionId, userId, userEmail) {
  if (!sessionId) return null;
  try {
    const trainer = isTrainerEmail(userEmail);
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
    let createdNow = false;

    // Only the shared trainer account that just logged in with this Batch ID may create.
    const createIntent = localStorage.getItem(CREATE_INTENT_KEY);
    const canCreate = trainer && createIntent === sessionId;

    if (!sessionRow) {
      if (!canCreate) {
        logSessionError('join session', new Error(`session ${sessionId} not found (create not allowed)`));
        return { notFound: true };
      }
      const { data: bootstrapped, error: bootstrapError } = await supabase.rpc(
        'bootstrap_training_session',
        { p_session_id: sessionId },
      );
      const bootstrapRow = Array.isArray(bootstrapped) ? bootstrapped[0] : bootstrapped;
      if (bootstrapError || !bootstrapRow?.board_id) {
        logSessionError('bootstrap session', bootstrapError);
        return null;
      }
      createdNow = true;
      sessionRow = {
        id: bootstrapRow.session_id || sessionId,
        board_id: bootstrapRow.board_id,
        created_by: bootstrapRow.created_by,
        facilitator_ids: bootstrapRow.facilitator_ids,
        status: bootstrapRow.status || 'active',
      };
    }

    if (createIntent === sessionId) {
      localStorage.removeItem(CREATE_INTENT_KEY);
    }

    if (!sessionRow?.board_id) return null;

    // Shared trainer account is always facilitator; everyone else is participant.
    const defaultRole = trainer ? 'facilitator' : 'participant';

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
      // Closed sessions: only trainers can attach as facilitator; block new student joins.
      if (isSessionClosed(sessionRow.status) && defaultRole !== 'facilitator') {
        return { closed: true, sessionRow };
      }
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
      participant = inserted || { role: defaultRole, can_override_workspace: defaultRole === 'facilitator' };
    } else {
      // Keep trainer role sticky if they join again as the shared account.
      if (trainer && participant.role !== 'facilitator') {
        const { data: upgraded } = await supabase
          .from('session_participants')
          .update({ role: 'facilitator', can_override_workspace: true, last_seen_at: new Date().toISOString() })
          .eq('session_id', sessionId)
          .eq('user_id', userId)
          .select('role, can_override_workspace')
          .single();
        if (upgraded) participant = upgraded;
      } else {
        supabase
          .from('session_participants')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('session_id', sessionId)
          .eq('user_id', userId);
      }
    }

    // Board RLS requires session membership — fetch only after participant row exists.
    const boardRecord = await fetchBoardById(sessionRow.board_id);
    if (!boardRecord) {
      logSessionError('load board', new Error(`board ${sessionRow.board_id} not accessible after join`));
      return null;
    }

    const role = trainer ? 'facilitator' : (participant?.role || defaultRole);
    const sessionStatus = sessionRow.status || 'active';
    const closed = isSessionClosed(sessionStatus);

    return {
      boardRecord,
      sessionRow,
      role,
      canOverrideWorkspace: role === 'facilitator',
      sessionStatus,
      createdNow,
      isTrainer: trainer,
      // Existing / closed boards open view-only for trainers until they click Reopen.
      // Newly created boards start editable. Closed sessions are view-only for everyone.
      canEdit: closed
        ? false
        : createdNow
          ? EDIT_ROLES.has(role)
          : role === 'participant'
            ? true
            : role === 'facilitator'
              ? false
              : false,
      canReopen: role === 'facilitator' && trainer && (!createdNow || closed),
    };
  } catch (err) {
    logSessionError('load session scoped board', err);
    return null;
  }
}

async function loadSessionScopedBoardWithRetry(sessionId, userId, userEmail, attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    await supabase.auth.getSession();
    const result = await loadSessionScopedBoard(sessionId, userId, userEmail);
    if (result) return result;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350 * (i + 1)));
    }
  }
  return null;
}

export default function Board({ session }) {
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const boardMountRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const currentBoardIdRef = useRef(null);
  const currentSessionIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      if (!session?.user?.id) return;
      if (!hasLoadedOnceRef.current) {
        setLoadError('');
        setBoardLoaded(false);
      }

      const { sessionId, shareBoardId, shareMode, shareToken } = getQueryParams();
      const userId = session.user.id;
      const userEmail = (session.user.email || '').toLowerCase();
      const userName = getDisplayName(session.user);

      let boardRecord = null;
      let role = 'participant';
      let canOverrideWorkspace = false;
      let resolvedSessionId = sessionId || null;
      let sessionStatus = 'active';
      let canReopen = false;
      let sessionCanEdit = null;
      const lastBoardId = localStorage.getItem('lpa-last-board-id');
      const lastSessionId = localStorage.getItem('lpa-last-session-id');

      if (sessionId) {
        const sessionScoped = await loadSessionScopedBoardWithRetry(sessionId, userId, userEmail);
        if (!sessionScoped) {
          setLoadError('Could not join this session yet. Please refresh the page or try again in a moment.');
          return;
        }
        if (sessionScoped.notFound) {
          setLoadError(
            isTrainerEmail(userEmail)
              ? 'Session not found. Log in again with this Session ID / Batch ID to create it.'
              : 'Session not found. Ask your trainer for a valid session link.',
          );
          return;
        }
        if (sessionScoped.closed && !sessionScoped.boardRecord) {
          setLoadError('This training session is closed. Only the trainer can reopen it.');
          return;
        }
        boardRecord = sessionScoped.boardRecord;
        role = sessionScoped.role;
        canOverrideWorkspace = sessionScoped.canOverrideWorkspace;
        resolvedSessionId = sessionScoped.sessionRow.id;
        sessionStatus = sessionScoped.sessionStatus || sessionScoped.sessionRow?.status || 'active';
        canReopen = !!sessionScoped.canReopen;
        sessionCanEdit = sessionScoped.canEdit;
      } else {
        const sessionScoped = await loadSessionScopedBoardWithRetry(lastSessionId, userId, userEmail);
        if (sessionScoped?.boardRecord) {
          boardRecord = sessionScoped.boardRecord;
          role = sessionScoped.role;
          canOverrideWorkspace = sessionScoped.canOverrideWorkspace;
          resolvedSessionId = sessionScoped.sessionRow.id;
          sessionStatus = sessionScoped.sessionStatus || sessionScoped.sessionRow?.status || 'active';
          canReopen = !!sessionScoped.canReopen;
          sessionCanEdit = sessionScoped.canEdit;
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
          canEdit = sessionCanEdit != null ? !!sessionCanEdit : EDIT_ROLES.has(role);
          if (isSessionClosed(sessionStatus)) canEdit = false;
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
        sessionStatus,
        canReopen: !!canReopen && role === 'facilitator' && isTrainerEmail(userEmail),
        isTrainer: isTrainerEmail(userEmail),
      };

      window.supabaseStorageSave = async (stateObj) => {
        if (!(window.boardAccess?.canEdit ?? canEdit)) return;
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

      if (cancelled) return;
      hasLoadedOnceRef.current = true;
      setBoardLoaded(true);
    };

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

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

  // Inject board HTML synchronously before paint so canvas exists before board_vanilla boots.
  useLayoutEffect(() => {
    if (!boardLoaded || !boardMountRef.current) return;
    if (!boardMountRef.current.querySelector('#canvas-world')) {
      boardMountRef.current.innerHTML = boardHtml;
    }
    if (window.__LPA_BOARD_VANILLA_LOADED__) {
      window.__LPA_BOARD_REINIT__?.();
    }
    setShellReady(true);
  }, [boardLoaded]);

  useEffect(() => {
    if (!shellReady) return undefined;

    const buildId = import.meta.env.VITE_BUILD_ID || (import.meta.env.DEV ? 'dev' : '');
    const iconsSrc = buildId ? `/board-icons.js?v=${buildId}` : '/board-icons.js';
    const vanillaSrc = buildId ? `/board_vanilla.js?v=${buildId}` : '/board_vanilla.js';

    const bootVanilla = () => {
      window.__LPA_BOARD_BOOT__?.();
    };

    const loadVanillaScript = () => {
      if (window.__LPA_BOARD_VANILLA_LOADED__) {
        bootVanilla();
        return;
      }

      const existing = document.querySelector('script[data-lpa-board-vanilla]');
      if (existing) {
        if (existing.dataset.loaded === '1') {
          bootVanilla();
        } else {
          existing.addEventListener('load', bootVanilla, { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.setAttribute('data-lpa-board-vanilla', '1');
      script.src = vanillaSrc;
      script.onload = () => {
        script.dataset.loaded = '1';
        bootVanilla();
      };
      document.body.appendChild(script);
    };

    const iconsReady = () =>
      window.__LPA_BOARD_ICONS_LOADED__ && window.BOARD_ICON_LIBRARY?.icons?.length;

    const loadIconsThenVanilla = () => {
      if (iconsReady()) {
        loadVanillaScript();
        return;
      }

      const existing = document.querySelector('script[data-lpa-board-icons]');
      if (existing) {
        const onIconsReady = () => {
          window.__LPA_BOARD_ICONS_LOADED__ = true;
          loadVanillaScript();
        };
        if (iconsReady()) {
          onIconsReady();
        } else {
          existing.addEventListener('load', onIconsReady, { once: true });
        }
        return;
      }

      const iconsScript = document.createElement('script');
      iconsScript.setAttribute('data-lpa-board-icons', '1');
      iconsScript.src = iconsSrc;
      iconsScript.onload = () => {
        window.__LPA_BOARD_ICONS_LOADED__ = true;
        loadVanillaScript();
      };
      iconsScript.onerror = () => {
        console.warn('board-icons.js failed to load — icon tool will be empty');
        loadVanillaScript();
      };
      document.body.appendChild(iconsScript);
    };

    loadIconsThenVanilla();
    return undefined;
  }, [shellReady]);

  if (loadError) {
    return (
      <div className="app-shell app-shell--center">
        <div className="app-state-card">
          <div className="app-state-icon app-state-icon--orange" aria-hidden="true">!</div>
          <h2 className="app-state-title">Could not join session</h2>
          <p className="app-state-message">{loadError}</p>
          <button type="button" className="auth-submit" onClick={() => window.location.reload()}>
            Refresh page
          </button>
        </div>
      </div>
    );
  }

  if (!boardLoaded) {
    return (
      <div className="app-shell">
        <div className="app-loader" role="status" aria-live="polite">
          <div className="app-loader-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M3 13L8 3L13 13" stroke="#fbfbfb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9.5h6" stroke="#fbfbfb" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="app-loader-text">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return <div ref={boardMountRef} className="board-shell" />;
}
