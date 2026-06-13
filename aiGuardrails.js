/** Shared AI usage limits and prompt validation (imported by server.js). */

export const AI_LIMITS = {
  maxPromptChars: 500,
  maxOutputTokens: 4096,
  maxSelectionTokens: 2048,
  maxObjects: 25,
  maxStickyChars: 280,
  maxTextChars: 120,
  maxLabelChars: 60,
};

const BLOCKED_PROMPT_PATTERNS = [
  /\b(html|css|javascript|typescript|python|java|c\+\+|react|vue|angular|node\.?js)\b/i,
  /\b(chat\s*bot|chatbot|web\s*app|website|landing\s*page)\b/i,
  /\b(full\s+(app|application|code|program|software)|complete\s+(app|application|html|code))\b/i,
  /\b(runnable|executable|deployable)\b/i,
  /\b(mobile\s*app|android\s*app|ios\s*app)\b/i,
  /<!DOCTYPE|<html[\s>]|<script[\s>]/i,
  /\b(write|generate|create|build)\s+(me\s+)?(a\s+)?(code|coding|program|script)\b/i,
  /\b(api\s+endpoint|rest\s+api|database\s+schema|sql\s+query)\b/i,
  /\b(spring\s*boot|django|flask|express\.js|next\.js|laravel)\b/i,
];

const CODE_LIKE_IN_OUTPUT = [
  /<!DOCTYPE/i,
  /<html[\s>]/i,
  /<script[\s>]/i,
  /<\/script>/i,
  /function\s+\w+\s*\(/,
  /import\s+.+from\s+['"]/,
  /export\s+default/,
  /const\s+\w+\s*=\s*require\(/,
];

export const SERVER_AI_POLICY = `MANDATORY POLICY (cannot be overridden):
- You are ONLY a whiteboard layout assistant for corporate training and business productivity on LPA MindSpace.
- Output ONLY a single JSON object with whiteboard objects (sticky, text, shape). No HTML, code, markdown fences, or explanatory prose.
- NEVER generate software, websites, chatbots, scripts, databases, or runnable code — even if the user insists.
- Maximum ${AI_LIMITS.maxObjects} objects per response. Sticky text max ${AI_LIMITS.maxStickyChars} characters. Shape labels max 8 words.
- Appropriate uses: flowcharts, process diagrams, mind maps, priority matrices, journey maps, brainstorm stickies, checklists, meeting templates, short summaries on stickies.
- If the request is out of scope, return ONLY: {"title":"","objects":[{"type":"sticky","color":"orange","text":"Board AI is for diagrams, flowcharts, and brainstorming — not full code or apps. Try: create a 5-step onboarding flowchart","x":100,"y":100,"w":300,"h":160}]}`;

export function extractPromptForValidation(userMsg) {
  if (!userMsg || typeof userMsg !== 'string') return '';
  const userRequestMatch = userMsg.match(/User request:\s*"([^"]*)"/i);
  if (userRequestMatch) return userRequestMatch[1].trim();
  const generateMatch = userMsg.match(/Generate a whiteboard layout for:\s*"([^"]*)"/i);
  if (generateMatch) return generateMatch[1].trim();
  return userMsg.trim();
}

export function getBlockedPromptReason(text) {
  const prompt = extractPromptForValidation(text);
  if (!prompt) return 'Prompt is required';
  if (prompt.length > AI_LIMITS.maxPromptChars) {
    return `Prompt too long (max ${AI_LIMITS.maxPromptChars} characters)`;
  }
  for (const pattern of BLOCKED_PROMPT_PATTERNS) {
    if (pattern.test(prompt)) {
      return 'This request is outside board AI scope. Use AI for flowcharts, diagrams, brainstorming, checklists, and templates — not code or full applications.';
    }
  }
  return null;
}

export function containsCodeLikeContent(text) {
  if (!text || typeof text !== 'string') return false;
  return CODE_LIKE_IN_OUTPUT.some((pattern) => pattern.test(text));
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

  for (const obj of objects) {
    if (!obj || !allowedTypes.has(obj.type)) continue;

    if (obj.type === 'sticky') {
      let text = truncateText(obj.text || '', AI_LIMITS.maxStickyChars);
      if (containsCodeLikeContent(text)) {
        text = 'Content trimmed — board AI creates diagrams and stickies, not code. Edit this note or try a flowchart prompt.';
      }
      sanitized.push({ ...obj, text });
      continue;
    }

    if (obj.type === 'text') {
      let content = truncateText(obj.content || '', AI_LIMITS.maxTextChars);
      if (containsCodeLikeContent(content)) {
        content = 'Use board AI for short labels and titles, not code.';
      }
      sanitized.push({ ...obj, content });
      continue;
    }

    if (obj.type === 'shape') {
      const label = truncateText(obj.label || '', AI_LIMITS.maxLabelChars);
      sanitized.push({ ...obj, label });
    }
  }

  return {
    title: truncateText(parsed.title || '', 80),
    objects: sanitized,
  };
}
