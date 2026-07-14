/**
 * Shared trainer account gate.
 * Configure with VITE_TRAINER_EMAILS (comma-separated).
 * Example: VITE_TRAINER_EMAILS=trainer@learnerspoint.com
 *
 * Password is NOT stored in code — create that user in Supabase Auth
 * and share the same email/password with all trainers.
 */

const FALLBACK_TRAINER_EMAILS = ['trainer@learnerspoint.com'];

function parseTrainerEmails(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getTrainerEmails() {
  const fromEnv = parseTrainerEmails(import.meta.env.VITE_TRAINER_EMAILS || '');
  if (fromEnv.length) return fromEnv;
  return FALLBACK_TRAINER_EMAILS.map((e) => e.toLowerCase());
}

export function isTrainerEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return getTrainerEmails().includes(normalized);
}

export const TRAINER_LOGIN_HINT =
  'Use the shared trainer email and password provided by your admin.';
