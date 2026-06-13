const RESERVED_PATH_SEGMENTS = new Set(['api']);

const SESSION_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/** Normalize user input into a URL-safe session slug (e.g. "Training June 03" → "training-june-03"). */
export function normalizeSessionSlug(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/** Read session id from the first URL path segment, e.g. /training-june-03 → training-june-03 */
export function getSessionIdFromPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (!segment || RESERVED_PATH_SEGMENTS.has(segment.toLowerCase())) return null;
  if (segment.includes('.')) return null;
  if (!SESSION_SLUG_PATTERN.test(segment)) return null;
  return decodeURIComponent(segment);
}

/** Path-based session takes precedence; ?session= is supported for legacy links. */
export function resolveSessionId(pathname, search = typeof window !== 'undefined' ? window.location.search : '') {
  const fromPath = getSessionIdFromPath(pathname);
  if (fromPath) return fromPath;
  const fromQuery = new URLSearchParams(search).get('session');
  return fromQuery?.trim() || null;
}

/** Build a shareable session path (and optional query flags). */
export function buildSessionUrl(sessionId, options = {}) {
  if (!sessionId) return '/';
  const slug = encodeURIComponent(sessionId);
  const params = new URLSearchParams();
  if (options.boardId) params.set('board', String(options.boardId));
  if (options.mode === 'view') params.set('mode', 'view');
  const qs = params.toString();
  return `/${slug}${qs ? `?${qs}` : ''}`;
}

export function buildSessionShareLink(sessionId, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  if (!sessionId) return origin || '/';
  return `${origin}/${encodeURIComponent(sessionId)}`;
}

export function isRootPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  return !trimmed;
}
