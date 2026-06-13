import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  AI_LIMITS,
  SERVER_AI_POLICY,
  getBlockedPromptReason,
} from './aiGuardrails.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

// claude-3-opus-20240229 was retired; override via ANTHROPIC_MODEL in Railway if needed
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || AI_LIMITS.maxOutputTokens;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: ANTHROPIC_MODEL,
    anthropicMaxTokens: ANTHROPIC_MAX_TOKENS,
    hasDist: fs.existsSync(distPath),
  });
});

app.post('/api/generate-board', async (req, res) => {
  try {
    const { systemPrompt, userMsg, mode = 'generate' } = req.body;

    const blockReason = getBlockedPromptReason(userMsg);
    if (blockReason) {
      return res.status(400).json({ error: blockReason, source: 'guardrail' });
    }

    // In production, fetch this securely from dotenv or secret manager
    const aiApiKey = process.env.ANTHROPIC_API_KEY;
    if (!aiApiKey) {
       return res.status(500).json({ error: 'API key is missing in backend secrets' });
    }

    const maxTokens = mode === 'selection'
      ? Math.min(ANTHROPIC_MAX_TOKENS, AI_LIMITS.maxSelectionTokens)
      : Math.min(ANTHROPIC_MAX_TOKENS, AI_LIMITS.maxOutputTokens);

    const fullSystemPrompt = `${SERVER_AI_POLICY}\n\n${systemPrompt || ''}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const anthropicMsg = err.error?.message || err.message;
      const detail =
        anthropicMsg ||
        (response.status === 404
          ? `Model "${ANTHROPIC_MODEL}" not found. Set ANTHROPIC_MODEL on Railway (e.g. claude-sonnet-4-6).`
          : `Anthropic API error ${response.status}`);
      return res.status(response.status).json({
        error: detail,
        source: 'anthropic',
        model: ANTHROPIC_MODEL,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('AI Proxy Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Production: serve Vite build (same origin as /api for AI proxy)
if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('board_vanilla.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  if (fs.existsSync(distPath)) console.log('Serving static files from dist/');
});

// Keep the HTTP server referenced so Node doesn't auto-exit.
if (typeof server.ref === 'function') {
  server.ref();
}

// Some Windows/node shells may not keep the event loop alive for this listener.
// Keep a lightweight timer so the backend remains available during dev.
const serverKeepAlive = setInterval(() => {}, 60 * 60 * 1000);

function shutdown() {
  clearInterval(serverKeepAlive);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
