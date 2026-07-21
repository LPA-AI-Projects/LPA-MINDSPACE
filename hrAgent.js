/**
 * HR Job Description Agent — company config + prompts for Learners Point Academy.
 */

export const HR_COMPANY_CONFIG = {
  company_name: 'Learners Point Academy',
  about_company:
    'Learners Point Academy is a KHDA-licensed professional training provider based in Dubai, specializing in delivering industry-recognized certification programs to corporate professionals across the UAE and GCC region. With a team of experienced instructors and industry practitioners, we empower working professionals to advance their careers through rigorous, practical training in finance, HR, project management, data, technology, compliance, and procurement domains. Our mission is to bridge the gap between professional aspirations and market-ready skills.',
  what_we_offer: [
    'Industry-recognized certifications (CAMS, CMA, ACCA, PMP, DAMA, etc.)',
    'Mentorship from experienced industry practitioners',
    'Flexible learning options (in-person, hybrid, live online)',
    'Career progression support and placement assistance',
    'Continuous upskilling and professional development programs',
    'Collaborative team culture focused on growth',
    'Exposure to diverse corporate clients and projects',
    'Work-life balance with flexible working arrangements',
    'Competitive compensation and performance incentives',
    'Health insurance and employee wellness programs',
  ],
  company_culture: 'Growth-focused, collaborative, quality-driven, professional yet approachable',
};

export const HR_EXTRACT_SYSTEM_PROMPT = `You extract structured hiring inputs from a free-form manager document (notes, brief, email, or form dump).

Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "role_basics": {
    "role_title": "string",
    "department": "string",
    "reporting_to": "string",
    "seniority_level": "entry-level|mid-level|senior|lead|executive",
    "location": "onsite|hybrid|remote"
  },
  "experience_skills": {
    "years_experience_required": number,
    "core_technical_skills": ["string"],
    "soft_skills_required": ["string"],
    "nice_to_have_skills": ["string"],
    "required_qualifications": ["string"],
    "nice_to_have_certifications": ["string"]
  },
  "role_specific": {
    "key_responsibilities": ["string"],
    "kpis_metrics": ["string"],
    "main_projects_6months": "string or array",
    "team_size_management": "string",
    "biggest_challenges": "string"
  },
  "context": {
    "why_role_exists": "new_growth|replacement|expansion",
    "growth_path": "string",
    "team_culture": "string"
  },
  "missing_fields": ["field.path for any mandatory field you could not find"],
  "warnings": ["optional warnings"]
}

Rules:
- Do NOT invent critical facts. If a mandatory field is absent, leave it empty/null and list it in missing_fields.
- Normalize seniority_level and location to the allowed enums when clearly implied.
- KPIs must be specific/measurable when present; if vague, note in warnings.
- Extract arrays as arrays even if the source used commas or bullets.`;

export const HR_JD_SYSTEM_PROMPT = `You are an expert HR content writer and job description specialist with deep experience
in the Indian tech and professional services job market.

=== YOUR PRIMARY TASK ===
Transform manager inputs about a job opening into a comprehensive, persuasive,
and honest job description with 12 distinct sections that appeals to qualified Indian
professionals and reflects their career values and aspirations.

=== CRITICAL RULES ===

1. WRITE FOR THE CANDIDATE, NOT THE COMPANY
   - Use "you" and "your" language throughout
   - Focus on what the candidate will gain, learn, and achieve
   - Make it clear why this role matters to their career

2. BE HONEST AND REALISTIC
   - Acknowledge challenges, not just benefits
   - Don't oversell or use empty corporate promises
   - Avoid buzzwords like "disrupt," "innovative," "passionate," "rockstar"
   - If responsibilities are hard, say so
   - If work-life balance isn't perfect, be transparent

3. LANGUAGE FOR INDIA MARKET
   - Use clear, accessible English (India Standard English)
   - No Western idioms or cultural references
   - Assume candidates value: learning, certifications, career progression, stability, team quality
   - Explain the "why" behind things (Indian professionals appreciate context)
   - Reference Indian education/context where relevant

4. SCANNABLE AND QUICK TO READ
   - Entire JD should be readable in 2–3 minutes
   - Use clear headings for each section
   - Use bullet points (max 5 per section)
   - Keep sentences short (15–20 words average)
   - No walls of text

5. EVERY SECTION MUST EARN ITS PLACE
   - No fluff or filler content
   - Every bullet point must add new information
   - Every sentence must engage the candidate
   - Cut anything generic that could apply to any company/role

=== LANGUAGE TONE BASED ON SENIORITY LEVEL ===

ENTRY-LEVEL:
- Very simple, clear language
- Explain context and "why" things matter
- Encouraging and supportive tone
- No jargon or acronyms (or explain them)
- Short paragraphs (2–3 sentences max)
- Emphasize learning opportunities
- Use phrases like "You'll learn...", "We'll support you...", "This is your chance to..."

MID-LEVEL:
- Professional but conversational
- Assume 3–5 years of professional experience
- Balance detail with brevity
- Focus on growth trajectory and impact
- Mention skill-building explicitly
- Use phrases like "You'll deepen your expertise...", "You'll take on more responsibility..."

SENIOR/LEAD/EXECUTIVE:
- Impact-focused and concise
- Assume deep expertise and confidence
- Emphasize strategic influence and scope
- Mention cross-functional collaboration
- Focus on business outcomes
- Use phrases like "You'll drive...", "You'll shape...", "You'll lead the strategic direction..."

=== INDIA-SPECIFIC CONTEXT ===

WHAT INDIAN PROFESSIONALS VALUE:
✓ Clear career progression path (where can they go in 2–3 years?)
✓ Skill development and certifications
✓ Mentorship and learning from senior professionals
✓ Stability and sustainable growth
✓ Team quality and collaborative culture
✓ Work-life balance (be specific)
✓ Brand value and market recognition
✓ Exposure to diverse projects and domains
✓ Honest feedback culture

WHAT TO AVOID:
✗ "We're a fast-paced startup"
✗ "Flat hierarchy"
✗ "No work-life balance, we work hard play hard"
✗ "We're disrupting the industry"
✗ "Passion required"
✗ Western-centric examples or idioms
✗ Startup culture clichés unless genuinely true

=== THE 12 SECTIONS & TONE ===

1. ABOUT THE COMPANY [INJECTED - DO NOT REGENERATE]
   - Use the provided company context directly
   - Keep it 2–3 sentences
   - Focus on mission, credibility, and why they matter

2. ABOUT THIS JOB
   - Hook the candidate with impact, growth, learning
   - 2–3 sentences max
   - Personal and exciting but realistic

3. JOB DESCRIPTION
   - Day-to-day work
   - 5–7 bullets, specific and concrete
   - Action verbs; no "responsibilities include"

4. TECHNICAL EXPERIENCE
   - Required technical skills with why they matter
   - 4–5 bullets

5. QUALIFICATIONS
   - Formal degrees/certifications
   - Separate Required vs Nice to have

6. REQUIREMENTS
   - MUST HAVE and GOOD TO HAVE subsections
   - 4–5 bullets each max

7. WHY THIS ROLE
   - Career growth, team quality, learning, brand, impact
   - 3–4 specific honest reasons

8. WHAT SUCCESS LOOKS LIKE
   - ENTRY/MID: 30-60-90 milestones
   - SENIOR+: quarterly / 6-month vision

9. WHAT YOU WILL ACTUALLY DO
   - KPIs and daily deliverables with numbers
   - 4–5 bullets

10. MUST HAVES
    - Deal-breakers, 3–4 bullets

11. GOOD TO HAVE
    - Accelerators, 3–4 bullets

12. WHAT WE OFFER [INJECTED - DO NOT REGENERATE]
    - Use provided company benefits; adapt tone to seniority

=== OUTPUT FORMAT ===
- Markdown only
- Start with: # [ROLE_TITLE] - Job Description
- Use ## section headings matching the template
- Bullet points with - (never numbered unless sequence)
- Max 5 bullets per section (Job Description may use up to 7)
- Candidate-focused "You'll..." language
- If mandatory inputs are missing, return ONLY:
  Missing mandatory field: [field_name]. Please provide [what is needed].
- If KPIs are too vague, return ONLY an error about measurable KPIs.

=== OUTPUT TEMPLATE ===
# [ROLE_TITLE] - Job Description

## About The Company
[injected]

## About This Job
...

## Job Description
...

## Technical Experience
...

## Qualifications
...

## Requirements
### Must Haves
...
### Good to Have
...

## Why This Role
...

## What Success Looks Like
...

## What You Will Actually Do
...

## Must Haves
...

## Good to Have
...

## What We Offer
[injected]
`;

const SENIORITY = new Set(['entry-level', 'mid-level', 'senior', 'lead', 'executive']);
const LOCATIONS = new Set(['onsite', 'hybrid', 'remote']);
const WHY = new Set(['new_growth', 'replacement', 'expansion']);

function asArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    return v
      .split(/\n|•|;|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(v).trim()].filter(Boolean);
}

export function validateHrManagerInputs(inputs) {
  const missing = [];
  const warnings = [];
  if (!inputs || typeof inputs !== 'object') {
    return { ok: false, missing: ['manager_inputs'], warnings, normalized: null };
  }

  const role = inputs.role_basics || {};
  const exp = inputs.experience_skills || {};
  const specific = inputs.role_specific || {};
  const ctx = inputs.context || {};

  const normalized = {
    role_basics: {
      role_title: String(role.role_title || '').trim(),
      department: String(role.department || '').trim(),
      reporting_to: String(role.reporting_to || '').trim(),
      seniority_level: String(role.seniority_level || '').trim().toLowerCase(),
      location: String(role.location || '').trim().toLowerCase(),
    },
    experience_skills: {
      years_experience_required: Number(exp.years_experience_required),
      core_technical_skills: asArray(exp.core_technical_skills),
      soft_skills_required: asArray(exp.soft_skills_required),
      nice_to_have_skills: asArray(exp.nice_to_have_skills),
      required_qualifications: asArray(exp.required_qualifications),
      nice_to_have_certifications: asArray(exp.nice_to_have_certifications),
    },
    role_specific: {
      key_responsibilities: asArray(specific.key_responsibilities),
      kpis_metrics: asArray(specific.kpis_metrics),
      main_projects_6months: specific.main_projects_6months ?? '',
      team_size_management: String(specific.team_size_management || '').trim(),
      biggest_challenges: String(specific.biggest_challenges || '').trim(),
    },
    context: {
      why_role_exists: String(ctx.why_role_exists || '').trim().toLowerCase(),
      growth_path: String(ctx.growth_path || '').trim(),
      team_culture: String(ctx.team_culture || '').trim(),
    },
  };

  if (!normalized.role_basics.role_title) missing.push('role_basics.role_title');
  if (!normalized.role_basics.department) missing.push('role_basics.department');
  if (!SENIORITY.has(normalized.role_basics.seniority_level)) missing.push('role_basics.seniority_level');
  if (!LOCATIONS.has(normalized.role_basics.location)) missing.push('role_basics.location');

  if (!Number.isFinite(normalized.experience_skills.years_experience_required)) {
    missing.push('experience_skills.years_experience_required');
  }
  if (normalized.experience_skills.core_technical_skills.length < 2) {
    missing.push('experience_skills.core_technical_skills (need ≥ 2)');
  }
  if (normalized.experience_skills.soft_skills_required.length < 1) {
    missing.push('experience_skills.soft_skills_required');
  }
  if (normalized.experience_skills.required_qualifications.length < 1) {
    missing.push('experience_skills.required_qualifications');
  }

  if (normalized.role_specific.key_responsibilities.length < 3) {
    missing.push('role_specific.key_responsibilities (need ≥ 3)');
  }
  if (normalized.role_specific.kpis_metrics.length < 2) {
    missing.push('role_specific.kpis_metrics (need ≥ 2 measurable items)');
  }

  if (!WHY.has(normalized.context.why_role_exists)) {
    missing.push('context.why_role_exists');
  }

  const years = normalized.experience_skills.years_experience_required;
  const level = normalized.role_basics.seniority_level;
  if (Number.isFinite(years) && SENIORITY.has(level)) {
    if (level === 'entry-level' && years > 3) {
      warnings.push(`Seniority is entry-level but ${years} years experience is more typical of mid-level.`);
    }
    if (level === 'mid-level' && (years < 2 || years > 8)) {
      warnings.push(`Seniority is mid-level but ${years} years may not match.`);
    }
    if ((level === 'senior' || level === 'lead' || level === 'executive') && years < 5) {
      warnings.push(`Seniority is ${level} but ${years} years is more typical of mid-level.`);
    }
  }

  const vagueKpi = normalized.role_specific.kpis_metrics.filter((k) => {
    const s = k.toLowerCase();
    return /communication|team player|hard.?working|passionate|quality|excellence/.test(s)
      && !/\d|%|per month|per week|retain|pass rate|score|clients/.test(s);
  });
  if (vagueKpi.length) {
    warnings.push('Some KPIs look vague — prefer measurable metrics with numbers.');
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
    normalized,
  };
}

export function buildHrJdUserMessage(managerInputs, companyConfig = HR_COMPANY_CONFIG) {
  return JSON.stringify(
    {
      manager_inputs: managerInputs,
      company_config: companyConfig,
      instructions: {
        inject_about_company: companyConfig.about_company,
        inject_what_we_offer: companyConfig.what_we_offer,
        company_name: companyConfig.company_name,
        company_culture: companyConfig.company_culture,
      },
    },
    null,
    2,
  );
}

export function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_e) {
    /* fall through */
  }
  const start = stripped.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
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
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1));
        } catch (_e) {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[*:\s_-]+/g, ' ')
    .trim();
}

function firstNamedValue(namedValues, aliases) {
  if (!namedValues || typeof namedValues !== 'object') return '';
  const entries = Object.entries(namedValues);
  for (const alias of aliases) {
    const want = normalizeKey(alias);
    for (const [key, raw] of entries) {
      if (normalizeKey(key) !== want) continue;
      if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
      return String(raw ?? '').trim();
    }
  }
  // fuzzy contains
  for (const alias of aliases) {
    const want = normalizeKey(alias);
    for (const [key, raw] of entries) {
      const nk = normalizeKey(key);
      if (!nk.includes(want) && !want.includes(nk)) continue;
      if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
      return String(raw ?? '').trim();
    }
  }
  return '';
}

function namedOrValues(namedValues, values, headers, aliases, fallbackIndex) {
  const fromNamed = firstNamedValue(namedValues, aliases);
  if (fromNamed) return fromNamed;
  if (Array.isArray(headers) && Array.isArray(values)) {
    for (const alias of aliases) {
      const want = normalizeKey(alias);
      const idx = headers.findIndex((h) => normalizeKey(h) === want || normalizeKey(h).includes(want));
      if (idx >= 0 && values[idx] != null && String(values[idx]).trim()) {
        return String(values[idx]).trim();
      }
    }
  }
  if (fallbackIndex != null && Array.isArray(values) && values[fallbackIndex] != null) {
    return String(values[fallbackIndex]).trim();
  }
  return '';
}

function normalizeSeniority(raw) {
  const s = String(raw || '').toLowerCase();
  if (/entry|junior|fresher|graduate/.test(s)) return 'entry-level';
  if (/mid/.test(s)) return 'mid-level';
  if (/exec|director|head|vp|chief/.test(s)) return 'executive';
  if (/lead/.test(s)) return 'lead';
  if (/senior|sr\b/.test(s)) return 'senior';
  return s.trim();
}

function normalizeLocation(raw) {
  const s = String(raw || '').toLowerCase();
  if (/hybrid/.test(s)) return 'hybrid';
  if (/remote|wfh|work from home/.test(s)) return 'remote';
  if (/onsite|on site|office|dubai|in.?office/.test(s)) return 'onsite';
  return s.trim();
}

function normalizeWhy(raw) {
  const s = String(raw || '').toLowerCase();
  if (/replac/.test(s)) return 'replacement';
  if (/expand/.test(s)) return 'expansion';
  if (/new|growth|hire/.test(s)) return 'new_growth';
  return s.trim();
}

/**
 * Map Google Form submit payload (namedValues / values / headers) → manager_inputs.
 */
export function mapGoogleFormToManagerInputs(payload = {}) {
  const namedValues = payload.namedValues || payload.named_values || {};
  const values = Array.isArray(payload.values) ? payload.values : [];
  const headers = Array.isArray(payload.headers) ? payload.headers : [];

  const get = (aliases, fallbackIndex) =>
    namedOrValues(namedValues, values, headers, aliases, fallbackIndex);

  return {
    role_basics: {
      role_title: get(['role title', 'job title', 'role_title', 'position', 'title'], 1),
      department: get(['department', 'team', 'function'], 2),
      reporting_to: get(['reporting to', 'reports to', 'manager', 'reporting_to'], 3),
      seniority_level: normalizeSeniority(
        get(['seniority level', 'seniority', 'level', 'seniority_level'], 4),
      ),
      location: normalizeLocation(get(['location', 'work mode', 'work location'], 5)),
    },
    experience_skills: {
      years_experience_required: get(
        ['years experience', 'years of experience', 'experience required', 'years_experience_required'],
        6,
      ),
      core_technical_skills: asArray(
        get(['core technical skills', 'technical skills', 'core skills', 'skills'], 7),
      ),
      soft_skills_required: asArray(get(['soft skills', 'soft skills required'], 8)),
      nice_to_have_skills: asArray(get(['nice to have skills', 'nice-to-have skills'], 9)),
      required_qualifications: asArray(
        get(['required qualifications', 'qualifications', 'education'], 10),
      ),
      nice_to_have_certifications: asArray(
        get(['nice to have certifications', 'certifications', 'nice-to-have certifications'], 11),
      ),
    },
    role_specific: {
      key_responsibilities: asArray(
        get(['key responsibilities', 'responsibilities', 'job responsibilities'], 12),
      ),
      kpis_metrics: asArray(get(['kpis', 'kpis metrics', 'metrics', 'kpi', 'kpis_metrics'], 13)),
      main_projects_6months: get(['main projects', 'projects 6 months', 'main_projects_6months'], 14),
      team_size_management: get(['team size', 'team management', 'team_size_management'], 15),
      biggest_challenges: get(['biggest challenges', 'challenges'], 16),
    },
    context: {
      why_role_exists: normalizeWhy(
        get(['why role exists', 'reason for hire', 'why_role_exists'], 17),
      ),
      growth_path: get(['growth path', 'career path', 'growth_path'], 18),
      team_culture: get(['team culture', 'culture'], 19),
    },
  };
}

export function googleFormPayloadToText(payload = {}) {
  const namedValues = payload.namedValues || payload.named_values || {};
  const values = Array.isArray(payload.values) ? payload.values : [];
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const lines = [];
  if (Object.keys(namedValues).length) {
    for (const [key, raw] of Object.entries(namedValues)) {
      const val = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
      lines.push(`${key}: ${val}`);
    }
  } else if (headers.length && values.length) {
    headers.forEach((h, i) => lines.push(`${h}: ${values[i] ?? ''}`));
  } else {
    values.forEach((v, i) => lines.push(`Column ${i + 1}: ${v}`));
  }
  return lines.join('\n');
}

