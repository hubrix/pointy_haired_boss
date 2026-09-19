import { readFileSync } from 'node:fs';
import { createFinding } from '../contracts/report.mjs';
import { resolveExemption, overlaps } from '../contracts/phrases.mjs';
import { validate } from '../contracts/validate.mjs';
import { deepFreeze } from '../contracts/catalog.mjs';

const data = JSON.parse(readFileSync(new URL('../../data/unicode-17.0.0.json', import.meta.url), 'utf8'));
export const unicodeRuleIds = Object.freeze(['UNI-01', 'UNI-02', 'UNI-03', 'UNI-04', 'UNI-05', 'UNI-06']);
export const codePointLabel = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const artifacts = new Set([0x00ad, 0x200b, 0x2060, 0xfeff]);
const bidi = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
const variation = (cp) => cp >= 0xfe00 && cp <= 0xfe0f || cp >= 0xe0100 && cp <= 0xe01ef || cp >= 0x180b && cp <= 0x180d || cp === 0x180f;
const emojiRoot = { children: new Map() };
for (const sequence of data.emoji) {
   let node = emojiRoot;
   for (const char of sequence) {
      if (!node.children.has(char)) node.children.set(char, { children: new Map() });
      node = node.children.get(char);
   }
   node.end = true;
}

export function visibleText(text) {
   return [...text].map((char) => {
      const cp = char.codePointAt(0);
      const category = data.characters[cp]?.[1];
      return category && /^(?:C.|Z.|M.)$/.test(category) || cp >= 0xe0000 && cp <= 0xe007f
         ? `<${codePointLabel(cp)}>` : char;
   }).join('');
}

function emojiRanges(text) {
   const ranges = [];
   for (let start = 0; start < text.length;) {
      let node = emojiRoot;
      let offset = start;
      let end = start;
      while (offset < text.length) {
         const char = String.fromCodePoint(text.codePointAt(offset));
         node = node.children.get(char);
         if (!node) break;
         offset += char.length;
         if (node.end) end = offset;
      }
      if (end > start) { ranges.push({ start, end }); start = end; }
      else start += String.fromCodePoint(text.codePointAt(start)).length;
   }
   return ranges;
}

function ruleFor(cp, record) {
   if (artifacts.has(cp)) return 'UNI-01';
   if (cp === 0x200c || cp === 0x200d || variation(cp)) return 'UNI-02';
   if (bidi.has(cp) || cp >= 0x206a && cp <= 0x206f) return 'UNI-03';
   if (record?.[1].startsWith('Z')) return 'UNI-04';
   if (cp >= 0xe0000 && cp <= 0xe007f) return 'UNI-05';
   return record ? 'UNI-06' : null;
}

export function inventoryUnicode(source, config, parsed, { path, selection } = {}) {
   const items = [];
   const findings = [];
   const edits = [];
   const emoji = emojiRanges(source.text);
   const prefix = source.text.match(/^\uFEFF+/)?.[0].length ?? 0;
   const removable = new Set(config.unicode.remove ?? []);
   const proseRanges = parsed.segments.map((segment) => ({ start: segment.map[0].start, end: segment.map.at(-1).end }));
   const context = { source, config, path, protectedSpans: parsed.protectedSpans, inlineSuppressions: parsed.inlineSuppressions };
   function inAsciiWord(start, end) {
      let left = start;
      let right = end;
      while (left > 0 && removable.has(codePointLabel(source.text.charCodeAt(left - 1)))) left--;
      while (right < source.text.length && removable.has(codePointLabel(source.text.charCodeAt(right)))) right++;
      return /[A-Za-z]/.test(source.text[left - 1] ?? '') && /[A-Za-z]/.test(source.text[right] ?? '');
   }
   for (let start = 0; start < source.text.length;) {
      const cp = source.text.codePointAt(start);
      const char = String.fromCodePoint(cp);
      const end = start + char.length;
      const record = data.characters[cp];
      const ruleId = ruleFor(cp, record);
      if (!ruleId || config.rules[ruleId] === 'off' || selection && (start < selection.start || end > selection.end)) { start = end; continue; }
      const range = { start, end };
      const protectedRange = parsed.protectedSpans.find((span) => overlaps(span, range));
      const signature = cp === 0xfeff && start < prefix;
      const scope = protectedRange ? 'protected' : signature ? 'signature' : proseRanges.some((span) => start >= span.start && end <= span.end) ? 'prose' : 'outside-prose';
      let action = 'preserve';
      let certainty = 'policy';
      let reason;
      if (protectedRange) reason = `Protected content: ${protectedRange.reason}`;
      else if (scope === 'outside-prose') reason = 'Outside mapped prose; preserve the original source.';
      else if (signature) {
         action = (config.unicode.bom ?? 'remove') === 'remove' ? 'remove' : 'preserve';
         reason = action === 'remove' ? 'Remove the initial UTF-8 signature under the declared BOM policy.' : 'Preserve the initial UTF-8 signature under the declared BOM policy.';
      } else if (emoji.some((span) => start >= span.start && end <= span.end)) {
         certainty = 'recognized';
         reason = 'Part of a listed Unicode Emoji 17.0 sequence; preserve its presentation.';
      } else if (ruleId === 'UNI-01') {
         if (removable.has(codePointLabel(cp)) && inAsciiWord(start, end)) {
            action = 'remove';
            reason = 'Explicit removal policy for this character inside an ASCII word; this changes its line-break behavior.';
         } else {
            action = 'review'; certainty = 'unknown';
            reason = 'May control a word or line break. Its purpose is unknown; preserve unless an applicable removal policy authorizes it.';
         }
      } else if (ruleId === 'UNI-02') {
         const previous = [...source.text.slice(Math.max(0, start - 2), start)].at(-1) ?? '';
         const next = String.fromCodePoint(source.text.codePointAt(end) ?? 32);
         if (variation(cp) && /[\p{L}\p{N}\p{S}]/u.test(previous) ||
             !variation(cp) && /[^\x00-\x7f]/.test(previous + next) && /[\p{L}\p{M}]/u.test(previous + next)) {
            reason = 'May control script shaping or glyph selection; preserve it. Sequence validity is not certified.';
         } else {
            action = 'review'; certainty = 'unknown';
            reason = 'Joiner or selector outside a recognized context; preserve pending review.';
         }
      } else if (ruleId === 'UNI-03') {
         action = 'review'; certainty = 'unknown';
         reason = 'Direction control: review the intended display order. No bidi control is removed by this policy.';
      } else if (ruleId === 'UNI-04') reason = 'Preserve spacing, nonbreaking behavior, and line/paragraph separators.';
      else if (ruleId === 'UNI-05') {
         action = 'review'; certainty = 'unknown';
         reason = 'Tag character outside a listed emoji sequence; preserve pending review. No payload is executed or removed.';
      } else if (record?.[2]) reason = 'Compatibility character: preserve its exact spelling; do not apply compatibility normalization.';
      else if (record?.[1].startsWith('M') && /[\p{L}\p{N}\p{M}]/u.test([...source.text.slice(Math.max(0, start - 2), start)].at(-1) ?? '')) {
         reason = 'Combining character following a possible base; preserve spelling and shaping.';
      } else {
         action = 'review'; certainty = 'unknown';
         reason = 'Combining or control character needs context; preserve it without normalization.';
      }
      const exemption = action === 'preserve' ? undefined : resolveExemption({ ...context, ruleId, range });
      if (exemption) { action = 'preserve'; certainty = 'policy'; reason = `Suppressed by ${exemption.kind}: ${exemption.reason}`; }
      if (action === 'remove' && parsed.check.status !== 'complete') {
         action = 'review'; certainty = 'unknown'; reason = 'Boundary coverage is incomplete; cleanup is blocked.';
      }
      const name = record?.[0] ?? `UNASSIGNED IN UNICODE ${data.version}`;
      const item = { ruleId, codePoint: codePointLabel(cp), name, span: source.span(start, end),
         context: { before: visibleText([...source.text.slice(Math.max(0, start - 32), start)].slice(-16).join('')),
            after: visibleText([...source.text.slice(end, end + 32)].slice(0, 16).join('')) },
         scope, action, certainty, reason };
      items.push(item);
      if (action !== 'preserve') {
         const fix = action === 'remove' ? { replacement: '', policy: 'safe-local' } : undefined;
         const finding = createFinding({ ...context, ruleId, range,
            reason: `${item.codePoint} ${name}. ${reason}`, fix });
         findings.push(finding);
         if (fix) edits.push({ ruleId, ...finding.fix, reason });
      }
      start = end;
   }
   return { inventory: deepFreeze(validate('unicode', { version: 1, unicodeVersion: data.version, inputHash: source.hash, items })),
      findings, edits, checks: unicodeRuleIds.filter((id) => config.rules[id] !== 'off').map((id) => ({ id, status: 'complete' })) };
}
