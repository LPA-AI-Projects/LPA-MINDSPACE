import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const MAX_SUBMISSIONS = 100;

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function createHrSubmissionStore(filePath) {
  ensureDir(filePath);

  function readAll() {
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function writeAll(items) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(items.slice(0, MAX_SUBMISSIONS), null, 2), 'utf8');
  }

  function list(limit = 20) {
    return readAll()
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        title: item.title || item.managerInputs?.role_basics?.role_title || 'Untitled role',
        source: item.source || 'google_form',
        error: item.error || null,
        warnings: item.warnings || [],
        hasMarkdown: Boolean(item.markdown),
      }));
  }

  function get(id) {
    return readAll().find((item) => item.id === id) || null;
  }

  function save(item) {
    const all = readAll().filter((x) => x.id !== item.id);
    all.unshift(item);
    writeAll(all);
    return item;
  }

  function create(partial) {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      source: 'google_form',
      title: '',
      managerInputs: null,
      rawPayload: null,
      markdown: null,
      warnings: [],
      error: null,
      ...partial,
    };
    return save(item);
  }

  function update(id, patch) {
    const item = get(id);
    if (!item) return null;
    const next = {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return save(next);
  }

  return { list, get, create, update, readAll };
}
