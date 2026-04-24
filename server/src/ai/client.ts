import Anthropic from '@anthropic-ai/sdk';
import { config, hasAI } from '../config';
import type { Annotation, Theme } from '../domain/types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!hasAI) throw new Error('ANTHROPIC_API_KEY not configured. Set it in .env to enable AI-assist features.');
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

const MODEL = 'claude-sonnet-4-5-20251001';

/**
 * Given a partial annotation (title + commentary) and the project's themes,
 * suggest the most likely theme and sentiment. Used in the annotation
 * workspace to auto-fill theme selection after the researcher types.
 */
export async function suggestTagging(
  input: { title: string; commentary: string; siteContext?: string },
  themes: Theme[],
): Promise<{ themeId: string | null; sentiment: 'positive' | 'negative' | 'neutral'; rationale: string }> {
  if (!themes.length) return { themeId: null, sentiment: 'neutral', rationale: 'No themes available.' };

  const themeDescriptions = themes
    .map((t) => `- "${t.name}" (id: ${t.id}): ${t.description ?? ''}`)
    .join('\n');

  const prompt = `You are helping a UX researcher tag an observation from a website benchmark.

The available themes are:
${themeDescriptions}

The researcher wrote:
Title: "${input.title}"
Commentary: "${input.commentary}"
${input.siteContext ? `Site context: ${input.siteContext}` : ''}

Based on this, pick the single most appropriate theme and judge sentiment.
Respond with ONLY a JSON object, no preamble:
{
  "themeId": "<id from list above>",
  "sentiment": "positive" | "negative" | "neutral",
  "rationale": "one sentence explanation"
}`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Strip any accidental markdown fencing
  const clean = text.replace(/^```json\s*|```$/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    const valid = themes.find((t) => t.id === parsed.themeId);
    return {
      themeId: valid ? parsed.themeId : themes[0].id,
      sentiment: ['positive', 'negative', 'neutral'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      rationale: parsed.rationale ?? '',
    };
  } catch (err) {
    return { themeId: themes[0].id, sentiment: 'neutral', rationale: 'Could not parse suggestion; defaulting.' };
  }
}

/**
 * Given all annotations for a theme across all sites in a project,
 * draft the three narrative panels (Learnings, Suggested Features, Summary).
 * The researcher edits this draft — it is explicitly a starting point.
 */
export async function draftThemeSynthesis(input: {
  themeName: string;
  themeDescription?: string;
  annotations: Array<{ siteName: string; sentiment: string; title: string; commentary: string; captureLabel: string }>;
}): Promise<{ learnings: string; suggestedFeatures: string; summary: string }> {
  if (!input.annotations.length) {
    return {
      learnings: '_No annotations yet for this theme. Tag observations in the annotation workspace to generate a draft._',
      suggestedFeatures: '',
      summary: '',
    };
  }

  const annotationList = input.annotations
    .map((a) => `- [${a.siteName} / ${a.captureLabel}] (${a.sentiment}) ${a.title}: ${a.commentary}`)
    .join('\n');

  const prompt = `You are helping a UX research team synthesise their benchmarking findings into a report.

The theme is: ${input.themeName}
${input.themeDescription ? `Theme description: ${input.themeDescription}` : ''}

The team has tagged these observations across multiple sites:
${annotationList}

Write three sections in markdown, each starting with its heading. Keep the tone analytical and concise. Use numbered lists inside each section where natural. Do NOT invent observations — work only from what was tagged. Quote site names when referencing specific examples.

## Learnings
(3-6 numbered, high-level findings a researcher would include in a benchmarking deck. Each learning starts with a short bold label, then one or two sentences.)

## Suggested Features
(3-5 concrete recommendations that flow from the learnings. Each is a short bold label followed by 1-2 sentences of rationale. These should be feature-level, not strategic.)

## Summary
(One paragraph summarising the theme across the benchmark set. Highlight patterns, tensions, and any clear leaders or laggards.)

Respond with only the three sections, nothing else.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Split the response by the three headings
  const sections = splitMarkdownSections(text);
  return {
    learnings: sections['Learnings'] ?? '',
    suggestedFeatures: sections['Suggested Features'] ?? '',
    summary: sections['Summary'] ?? '',
  };
}

function splitMarkdownSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const regex = /^##\s+(.+?)$/gm;
  const matches: Array<{ name: string; index: number; length: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(md)) !== null) {
    matches.push({ name: m[1].trim(), index: m.index, length: m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    out[matches[i].name] = md.slice(start, end).trim();
  }
  return out;
}
