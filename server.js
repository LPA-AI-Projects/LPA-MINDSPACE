import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  AI_LIMITS,
  BOARD_GENERATE_SYSTEM_PROMPT,
  BOARD_SELECTION_SYSTEM_PROMPT,
  buildGenerateUserMessage,
  evaluateAiPrompt,
  extractPromptForValidation,
  sanitizeAiResponseText,
} from './aiGuardrails.js';
import {
  HR_COMPANY_CONFIG,
  HR_EXTRACT_SYSTEM_PROMPT,
  HR_JD_SYSTEM_PROMPT,
  buildHrJdUserMessage,
  extractJsonObject,
  googleFormPayloadToText,
  mapGoogleFormToManagerInputs,
  validateHrManagerInputs,
} from './hrAgent.js';
import { createHrSubmissionStore } from './hrSubmissionStore.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');
const hrStore = createHrSubmissionStore(path.join(__dirname, 'data', 'hr-submissions.json'));

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || AI_LIMITS.maxOutputTokens;
const HR_FORM_WEBHOOK_SECRET = String(process.env.HR_FORM_WEBHOOK_SECRET || '').trim();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: ANTHROPIC_MODEL,
    anthropicMaxTokens: ANTHROPIC_MAX_TOKENS,
    aiGuardrails: true,
    hrAgent: true,
    hrFormWebhook: Boolean(HR_FORM_WEBHOOK_SECRET),
    hasDist: fs.existsSync(distPath),
  });
});

async function callAnthropic({ system, user, maxTokens }) {
  const aiApiKey = process.env.ANTHROPIC_API_KEY;
  if (!aiApiKey) {
    const err = new Error('API key is missing in backend secrets');
    err.status = 500;
    err.source = 'config';
    throw err;
  }

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
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const anthropicMsg = errBody.error?.message || errBody.message;
    const err = new Error(
      anthropicMsg ||
        (response.status === 404
          ? `Model "${ANTHROPIC_MODEL}" not found. Set ANTHROPIC_MODEL on Railway (e.g. claude-sonnet-4-6).`
          : `Anthropic API error ${response.status}`),
    );
    err.status = response.status;
    err.source = 'anthropic';
    throw err;
  }

  const data = await response.json();
  return {
    text: data.content?.[0]?.text || '',
    raw: data,
  };
}

function initSse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function assertHrWebhookSecret(req) {
  if (!HR_FORM_WEBHOOK_SECRET) {
    const err = new Error('HR_FORM_WEBHOOK_SECRET is not configured on the server');
    err.status = 500;
    err.source = 'config';
    throw err;
  }
  const headerSecret = String(req.get('x-hr-webhook-secret') || '').trim();
  const bodySecret = String(req.body?.secret || '').trim();
  if (headerSecret !== HR_FORM_WEBHOOK_SECRET && bodySecret !== HR_FORM_WEBHOOK_SECRET) {
    const err = new Error('Unauthorized webhook');
    err.status = 401;
    err.source = 'auth';
    throw err;
  }
}

async function resolveManagerInputsFromForm(payload, emit = () => {}) {
  emit('received', 'Google Form submission received');
  emit('mapping', 'Mapping form fields to HR schema…');

  let mapped = mapGoogleFormToManagerInputs(payload);
  let validation = validateHrManagerInputs(mapped);

  if (!validation.ok) {
    emit('extracting_fields', 'Some fields incomplete — asking HR AGENT to interpret the form…');
    const formText = googleFormPayloadToText(payload);
    const extractResult = await callAnthropic({
      system: HR_EXTRACT_SYSTEM_PROMPT,
      user: `Google Form submission:\n\n${formText.slice(0, 60000)}\n\nPartial mapped JSON:\n${JSON.stringify(mapped, null, 2)}`,
      maxTokens: Math.min(ANTHROPIC_MAX_TOKENS, 4096),
    });
    const extracted = extractJsonObject(extractResult.text);
    if (extracted) {
      mapped = extracted;
      validation = validateHrManagerInputs(extracted);
    }
  }

  emit('validating', 'Validating mandatory HR fields…');
  if (!validation.ok) {
    const err = new Error(`Missing mandatory fields: ${validation.missing.join(', ')}`);
    err.status = 422;
    err.source = 'validation';
    err.missing = validation.missing;
    err.warnings = validation.warnings;
    throw err;
  }

  return validation;
}

async function generateJdFromValidated(validation, emit = () => {}) {
  if (validation.warnings?.length) {
    emit('validating', 'Inputs validated with warnings', { warnings: validation.warnings });
  }

  emit('llm', 'Sending validated brief to HR writer…');
  emit('generating', 'Writing professional 12-section job description…');

  const jdResult = await callAnthropic({
    system: HR_JD_SYSTEM_PROMPT,
    user: buildHrJdUserMessage(validation.normalized, HR_COMPANY_CONFIG),
    maxTokens: Math.max(ANTHROPIC_MAX_TOKENS, 8192),
  });

  const markdown = String(jdResult.text || '').trim();
  if (!markdown) {
    const err = new Error('HR AGENT returned an empty job description');
    err.source = 'generate';
    throw err;
  }
  if (/^missing mandatory field/i.test(markdown) || /^kpis must be specific/i.test(markdown)) {
    const err = new Error(markdown);
    err.source = 'generate';
    throw err;
  }

  emit('complete', 'Job description ready', {
    title: validation.normalized.role_basics.role_title,
  });

  return {
    markdown,
    title: `${validation.normalized.role_basics.role_title} - Job Description`,
    managerInputs: validation.normalized,
    warnings: validation.warnings,
    company: HR_COMPANY_CONFIG.company_name,
  };
}

async function processSubmissionJob(id) {
  const item = hrStore.get(id);
  if (!item) return;
  hrStore.update(id, { status: 'processing', error: null });
  try {
    const validation = await resolveManagerInputsFromForm(item.rawPayload || {});
    const result = await generateJdFromValidated(validation);
    hrStore.update(id, {
      status: 'ready',
      title: result.title,
      managerInputs: result.managerInputs,
      markdown: result.markdown,
      warnings: result.warnings || [],
      error: null,
    });
  } catch (err) {
    console.error('HR submission processing failed', id, err);
    hrStore.update(id, {
      status: 'error',
      error: err.message || 'HR AGENT failed',
      warnings: err.warnings || [],
    });
  }
}

/** Google Apps Script → webhook (fast ACK, generate in background) */
app.post('/api/hr-agent/form-submit', async (req, res) => {
  try {
    assertHrWebhookSecret(req);
    const payload = req.body || {};
    const hasData =
      (payload.namedValues && Object.keys(payload.namedValues).length)
      || (payload.named_values && Object.keys(payload.named_values).length)
      || (Array.isArray(payload.values) && payload.values.length);

    if (!hasData) {
      return res.status(400).json({
        ok: false,
        error: 'Expected values and/or namedValues from Google Form submit',
      });
    }

    const mapped = mapGoogleFormToManagerInputs(payload);
    const titleGuess = mapped.role_basics?.role_title || 'New role submission';
    const item = hrStore.create({
      status: 'pending',
      title: titleGuess,
      rawPayload: {
        timestamp: payload.timestamp || payload.values?.[0] || null,
        values: payload.values || [],
        namedValues: payload.namedValues || payload.named_values || {},
        headers: payload.headers || [],
        range: payload.range || null,
      },
      managerInputs: mapped,
      source: 'google_form',
    });

    // Do not generate in the background — the open facilitator board
    // picks this up and runs live SSE animation → JD on canvas.

    return res.status(202).json({
      ok: true,
      id: item.id,
      status: 'pending',
      title: item.title,
      message: 'Form received. Open board will start HR AGENT automatically.',
    });
  } catch (err) {
    console.error('HR form-submit error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Webhook failed',
      source: err.source || 'server',
    });
  }
});

app.get('/api/hr-agent/submissions', (_req, res) => {
  const limit = Math.min(50, Number(_req.query.limit) || 20);
  return res.json({ ok: true, submissions: hrStore.list(limit) });
});

app.get('/api/hr-agent/submissions/:id', (req, res) => {
  const item = hrStore.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Submission not found' });
  return res.json({
    ok: true,
    submission: {
      id: item.id,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      title: item.title,
      warnings: item.warnings || [],
      error: item.error,
      markdown: item.markdown,
      managerInputs: item.managerInputs,
      company: HR_COMPANY_CONFIG.company_name,
    },
  });
});

/** Facilitator generates (or regenerates) with live SSE progress */
app.post('/api/hr-agent/generate/:id', async (req, res) => {
  initSse(res);
  const emit = (stage, message, extra = {}) => {
    sendSse(res, 'progress', { stage, message, ...extra, at: Date.now() });
  };

  try {
    const item = hrStore.get(req.params.id);
    if (!item) {
      sendSse(res, 'error', { error: 'Submission not found', source: 'store' });
      return res.end();
    }

    hrStore.update(item.id, { status: 'processing', error: null });
    emit('received', 'Loaded Google Form submission');

    const validation = await resolveManagerInputsFromForm(item.rawPayload || {}, emit);
    const result = await generateJdFromValidated(validation, emit);

    hrStore.update(item.id, {
      status: 'ready',
      title: result.title,
      managerInputs: result.managerInputs,
      markdown: result.markdown,
      warnings: result.warnings || [],
      error: null,
    });

    sendSse(res, 'result', {
      ...result,
      submissionId: item.id,
      source: 'google_form',
    });
    return res.end();
  } catch (err) {
    console.error('HR generate error:', err);
    if (req.params.id) {
      hrStore.update(req.params.id, {
        status: 'error',
        error: err.message || 'HR AGENT failed',
      });
    }
    sendSse(res, 'error', {
      error: err.message || 'HR AGENT failed',
      missing: err.missing,
      warnings: err.warnings,
      source: err.source || 'server',
    });
    return res.end();
  }
});

app.post('/api/generate-board', async (req, res) => {
  try {
    const { prompt, userMsg, mode = 'generate', context = null, selection = null } = req.body;

    const userPrompt = (prompt || '').trim() || extractPromptForValidation(userMsg);
    const evaluation = evaluateAiPrompt(userPrompt);
    if (!evaluation.allowed) {
      return res.status(400).json({ error: evaluation.reason, source: 'guardrail' });
    }

    const maxTokens = mode === 'selection'
      ? Math.min(ANTHROPIC_MAX_TOKENS, AI_LIMITS.maxSelectionTokens)
      : Math.min(ANTHROPIC_MAX_TOKENS, AI_LIMITS.maxOutputTokens);

    const systemPrompt = mode === 'selection'
      ? BOARD_SELECTION_SYSTEM_PROMPT
      : BOARD_GENERATE_SYSTEM_PROMPT;

    let finalUserMsg = userMsg;
    if (mode === 'generate') {
      finalUserMsg = buildGenerateUserMessage(userPrompt, context || {});
    } else if (mode === 'selection' && selection) {
      finalUserMsg = `Selected objects: ${JSON.stringify(selection.objects || [])}

Selection bounding box: x:${selection.bounds?.x ?? 0}, y:${selection.bounds?.y ?? 0}, w:${selection.bounds?.w ?? 0}, h:${selection.bounds?.h ?? 0}

User request: "${userPrompt}"

Replace or modify the selected objects according to the request. Keep them in roughly the same position.`;
    }

    const { text, raw } = await callAnthropic({
      system: systemPrompt,
      user: finalUserMsg,
      maxTokens,
    });

    try {
      const sanitizedJson = sanitizeAiResponseText(text);
      if (raw.content?.[0]) raw.content[0].text = sanitizedJson;
    } catch (sanitizeErr) {
      return res.status(422).json({
        error: sanitizeErr.message || 'AI response was not valid board content',
        source: 'guardrail',
      });
    }

    return res.json(raw);
  } catch (err) {
    console.error('AI Proxy Error:', err);
    return res.status(err.status || 500).json({
      error: err.message,
      source: err.source || 'server',
      model: ANTHROPIC_MODEL,
    });
  }
});

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

if (typeof server.ref === 'function') {
  server.ref();
}

const serverKeepAlive = setInterval(() => {}, 60 * 60 * 1000);

function shutdown() {
  clearInterval(serverKeepAlive);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
