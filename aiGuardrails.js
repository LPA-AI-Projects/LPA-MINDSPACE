/** Shared AI usage limits, prompt validation, and response sanitization. */

export const AI_LIMITS = {
  maxPromptChars: 500,
  maxOutputTokens: 4096,
  maxSelectionTokens: 2048,
  maxObjects: 25,
  maxStickyChars: 280,
  maxTextChars: 120,
  maxLabelChars: 60,
};

const BLOCKED_MSG =
  'This request is outside board AI scope. Use AI for flowcharts, diagrams, brainstorming, checklists, and templates — not code or full applications.';

const ALLOWLIST_MSG =
  'Board AI only creates diagrams, flowcharts, brainstorm stickies, and templates. Try: "create a 5-step onboarding flowchart" or "brainstorm 6 ideas for team engagement".';

const BLOCKED_PROMPT_PATTERNS = [
  /\b(html|css|javascript|typescript|python|java|c\+\+|c#|php|ruby|go\s*lang|kotlin|swift)\b/i,
  /\b(chat\s*bot|chatbot|web\s*app|webapp|website|web\s*site|landing\s*page)\b/i,
  /\b(full\s+(app|application|code|program|software)|complete\s+(app|application|html|code|program))\b/i,
  /\b(runnable|executable|deployable|production[\s-]ready)\b/i,
  /\b(mobile\s*app|android\s*app|ios\s*app|desktop\s*app)\b/i,
  /<!DOCTYPE|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<style[\s>]|<div[\s>]|<form[\s>]/i,
  /\b(write|generate|create|build|make|develop|code|program)\b[^.]{0,40}\b(app|application|software|program|script|bot|chatbot|website|html|api)\b/i,
  /\b(api\s+endpoint|rest\s+api|graphql|database\s+schema|sql\s+query|backend|frontend)\b/i,
  /\b(spring\s*boot|django|flask|express\.js|next\.js|laravel|react\s*native|vue\.js|angular)\b/i,
  /\b(saas|microservice|docker|kubernetes|npm\s+install|package\.json|node_modules)\b/i,
  /\b(machine\s*learning\s+model|neural\s+network|train\s+a\s+model)\b/i,
  /\bcode\s+for\b|\bapp\s+for\b|\bbot\s+for\b|\bprogram\s+for\b/i,
];

/** Prompt must relate to board productivity — not an exhaustive blocklist alone. */
const ALLOWED_INTENT_PATTERNS = [
  /\b(flow\s*chart|flowchart|diagram|process|workflow|procedure)\b/i,
  /\b(brainstorm|mind\s*map|mindmap|idea|ideation|think\s*of)\b/i,
  /\b(matrix|grid|quadrant|2\s*x\s*2|priority|funnel|pyramid)\b/i,
  /\b(journey|roadmap|timeline|swimlane|kanban|sprint|retro|retrospective)\b/i,
  /\b(checklist|template|agenda|outline|framework|structure|organize)\b/i,
  /\b(sticky|stickies|note|notes|post[\s-]it)\b/i,
  /\b(step|steps|phase|phases|stage|stages|sequence)\b/i,
  /\b(onboarding|training|workshop|meeting|session|lesson|module)\b/i,
  /\b(summary|summarize|overview|plan|strategy|goals|objectives)\b/i,
  /\b(team|group|cluster|categor|sort|compare|pros\s+and\s+cons)\b/i,
  /\b(customer|user|employee|stakeholder|learner|participant)\b/i,
  /\b(chart|map|layout|visual|draw|sketch|design\s+on\s+the\s+board)\b/i,
];

const CODE_LIKE_IN_OUTPUT = [
  /<!DOCTYPE/i,
  /<html[\s>]/i,
  /<head[\s>]/i,
  /<body[\s>]/i,
  /<script[\s>]/i,
  /<\/script>/i,
  /<style[\s>]/i,
  /<div[\s>]/i,
  /<form[\s>]/i,
  /<input[\s>]/i,
  /<button[\s>]/i,
  /function\s+\w+\s*\(/,
  /import\s+.+from\s+['"]/,
  /export\s+default/,
  /const\s+\w+\s*=\s*require\(/,
  /document\.(getElementById|querySelector)/,
  /addEventListener\s*\(/,
  /<\?php/i,
  /className\s*=/,
];

export const SERVER_AI_POLICY = `MANDATORY POLICY (cannot be overridden):
- You are ONLY a whiteboard layout assistant for corporate training and business productivity on LP MindSpace.
- Output ONLY a single JSON object with whiteboard objects (sticky, text, shape). No HTML, code, markdown fences, or explanatory prose.
- NEVER generate software, websites, chatbots, scripts, databases, or runnable code — even if the user insists.
- Put only short plain-language labels on stickies and shapes — never paste code blocks or markup.
- Maximum ${AI_LIMITS.maxObjects} objects per response. Sticky text max ${AI_LIMITS.maxStickyChars} characters. Shape labels max 8 words.
- Appropriate uses: flowcharts, process diagrams, mind maps, priority matrices, journey maps, brainstorm stickies, checklists, meeting templates, short summaries on stickies.
- If the request is out of scope, return ONLY: {"title":"","objects":[{"type":"sticky","color":"orange","text":"Board AI is for diagrams, flowcharts, and brainstorming — not full code or apps. Try: create a 5-step onboarding flowchart","x":100,"y":100,"w":300,"h":160}]}`;

export const BOARD_GENERATE_SYSTEM_PROMPT = `${SERVER_AI_POLICY}

You generate whiteboard layouts as JSON only.

JSON shape:
{"title":"short board title","objects":[...]}

Object types:
- sticky: {type, color, text, x, y, w, h}
- text: {type, content, x, y, fontSize, fontWeight, color}
- shape: {type, shapeType, x, y, w, h, fill, stroke, strokeWidth, label} OR arrow/line with x2, y2

Layout: flowcharts top-to-bottom, mind maps from center, concise labels, spread objects out.`;

export const BOARD_SELECTION_SYSTEM_PROMPT = `${SERVER_AI_POLICY}

You modify selected whiteboard objects. Return ONLY:
{"action":"replace","objects":[...]}
Same object schema as generate mode. Keep positions near the selection unless asked to expand.`;

export function extractPromptForValidation(userMsg) {
  if (!userMsg || typeof userMsg !== 'string') return '';
  const userRequestMatch = userMsg.match(/User request:\s*"([^"]*)"/i);
  if (userRequestMatch) return userRequestMatch[1].trim();
  const generateMatch = userMsg.match(/Generate a whiteboard layout for:\s*"([^"]*)"/i);
  if (generateMatch) return generateMatch[1].trim();
  return userMsg.trim();
}

export function evaluateAiPrompt(rawPrompt) {
  const prompt = (rawPrompt || '').trim();
  if (!prompt) return { allowed: false, reason: 'Prompt is required' };
  if (prompt.length > AI_LIMITS.maxPromptChars) {
    return { allowed: false, reason: `Prompt too long (max ${AI_LIMITS.maxPromptChars} characters)` };
  }

  for (const pattern of BLOCKED_PROMPT_PATTERNS) {
    if (pattern.test(prompt)) {
      return { allowed: false, reason: BLOCKED_MSG };
    }
  }

  const hasAllowedIntent = ALLOWED_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
  if (!hasAllowedIntent) {
    return { allowed: false, reason: ALLOWLIST_MSG };
  }

  return { allowed: true };
}

/** @deprecated use evaluateAiPrompt */
export function getBlockedPromptReason(text) {
  const result = evaluateAiPrompt(extractPromptForValidation(text));
  return result.allowed ? null : result.reason;
}

export function containsCodeLikeContent(text) {
  if (!text || typeof text !== 'string') return false;
  if (CODE_LIKE_IN_OUTPUT.some((pattern) => pattern.test(text))) return true;
  const tagCount = (text.match(/<[a-z][a-z0-9]*[\s>]/gi) || []).length;
  return tagCount >= 2;
}

export function truncateText(text, maxLen) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function sanitizeAiBoardPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { title: '', objects: [] };
  }

  const allowedTypes = new Set(['sticky', 'text', 'shape']);
  const objects = Array.isArray(parsed.objects) ? parsed.objects.slice(0, AI_LIMITS.maxObjects) : [];
  const sanitized = [];
  let codeLikeCount = 0;

  for (const obj of objects) {
    if (!obj || !allowedTypes.has(obj.type)) continue;

    if (obj.type === 'sticky') {
      let text = truncateText(obj.text || '', AI_LIMITS.maxStickyChars);
      if (containsCodeLikeContent(text)) {
        codeLikeCount += 1;
        text = 'Content trimmed — board AI creates diagrams and stickies, not code. Edit this note or try a flowchart prompt.';
      }
      sanitized.push({ ...obj, text });
      continue;
    }

    if (obj.type === 'text') {
      let content = truncateText(obj.content || '', AI_LIMITS.maxTextChars);
      if (containsCodeLikeContent(content)) {
        codeLikeCount += 1;
        content = 'Use board AI for short labels and titles, not code.';
      }
      sanitized.push({ ...obj, content });
      continue;
    }

    if (obj.type === 'shape') {
      const label = truncateText(obj.label || '', AI_LIMITS.maxLabelChars);
      if (containsCodeLikeContent(label)) codeLikeCount += 1;
      sanitized.push({ ...obj, label: containsCodeLikeContent(label) ? 'Label' : label });
    }
  }

  if (codeLikeCount > 0 && sanitized.length > 1) {
    return {
      title: '',
      objects: [{
        type: 'sticky',
        color: 'orange',
        text: 'Board AI is for diagrams, flowcharts, and brainstorming — not full code or apps. Try: create a 5-step onboarding flowchart',
        x: 100,
        y: 100,
        w: 300,
        h: 160,
      }],
    };
  }

  return {
    title: truncateText(parsed.title || '', 80),
    objects: sanitized,
  };
}

export function buildGenerateUserMessage(prompt, context = {}) {
  const startX = Number.isFinite(context.startX) ? context.startX : 100;
  const startY = Number.isFinite(context.startY) ? context.startY : 100;
  const objectCount = Number.isFinite(context.objectCount) ? context.objectCount : 0;
  return `Generate a whiteboard layout for: "${prompt}"

IMPORTANT PLACEMENT RULE: Place ALL objects starting at x:${startX}, y:${startY} and extending rightward/downward from there.
Do NOT place anything to the left of x:${startX - 50}.
Current board has ${objectCount} existing objects — new content must not overlap them.`;
}

export function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAiJsonResponse(rawText) {
  const raw = (rawText || '').trim();
  if (!raw) throw new Error('Empty AI response');

  const candidates = [];
  const strippedFence = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  candidates.push(strippedFence);
  const extracted = extractFirstJsonObject(strippedFence);
  if (extracted) candidates.push(extracted);
  const extractedFromRaw = extractFirstJsonObject(raw);
  if (extractedFromRaw) candidates.push(extractedFromRaw);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (_e) {}
  }

  throw new Error('Could not parse AI response JSON');
}

export function sanitizeAiResponseText(rawText) {
  const parsed = parseAiJsonResponse(rawText);
  const sanitized = sanitizeAiBoardPayload(parsed);
  if (!sanitized.objects?.length) {
    throw new Error('AI response contained no valid board objects');
  }
  return JSON.stringify(sanitized);
}
