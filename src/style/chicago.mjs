import { createFinding } from '../contracts/report.mjs';
import { deepFreeze } from '../contracts/catalog.mjs';
import { validate } from '../contracts/validate.mjs';
import { sourceRange } from '../check/parser.mjs';
import { chicagoRules } from './chicago-rules.mjs';

const patterns = {
   'CMO-01': /(?<=[\p{L}\p{N}])[\t ]*—[\t ]*(?=[\p{L}\p{N}])/gu,
   'CMO-02': /:[\t ]+(?:it|this|that|we|they|he|she|you)[\t ]+(?:is|are|was|were|will|must|can|may|has|have|had|do|does|did|should|could|would)\b[^.!?\n]*[.!?]/gu,
   'CMO-03': /(?<![\p{L}\p{M}\p{N}_])e-books?(?![\p{L}\p{M}\p{N}_])/giu,
   'CMO-04': /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)[\t ]+(?:[12]\d|3[01]|[1-9])(?:st|nd|rd|th)\b/g,
   'CMO-05': /(?<![\p{L}\p{M}\p{N}_])(?:e\.g\.|i\.e\.)[\t ]+(?=[\p{L}\p{N}])/gu,
};

export function checkChicago(source, config, parsed, { path, selection } = {}) {
   const findings = [];
   const checks = [];
   const context = { source, config, path, protectedSpans: parsed.protectedSpans, inlineSuppressions: parsed.inlineSuppressions };
   const selected = (range) => !selection || range.start >= selection.start && range.end <= selection.end;
   const definitions = chicagoRules.filter((rule) => config.rules[rule.ruleId] !== 'off');
   function report(rule, range) {
      if (selected(range)) findings.push(createFinding({ ...context, ruleId: rule.ruleId, range,
         status: 'candidate', evidence: 'heuristic',
         reason: `${rule.id}: ${rule.guidance} ${rule.exceptions} Source edition: ${rule.sourceEdition}; ${rule.reference}` }));
   }
   for (const rule of definitions) {
      checks.push({ id: rule.ruleId, status: 'partial',
         reason: `Local review candidates for ${rule.id} only (source edition ${rule.sourceEdition}). The wider family and contextual exceptions require editorial review.` });
      if (rule.ruleId === 'CMO-06') {
         for (const quote of parsed.protectedSpans.filter((span) => span.reason === 'Exact quotation.')) {
            const end = quote.end;
            if (!/^[.,]$/.test(source.text[end] ?? '')) continue;
            // Only punctuation mapped into eligible prose can be reported.
            if (parsed.segments.some((segment) => segment.map.some((unit) => unit.start === end && unit.end === end + 1))) {
               report(rule, { start: end, end: end + 1 });
            }
         }
         continue;
      }
      for (const segment of parsed.segments) {
         for (const match of segment.text.matchAll(patterns[rule.ruleId])) {
            if (rule.ruleId === 'CMO-01' && !/[\t ]/.test(match[0])) continue;
            // CMO-02 checks body sentences, not headings or table labels.
            if (rule.ruleId === 'CMO-02' && segment.kind !== 'paragraph') continue;
            report(rule, sourceRange(segment, { start: match.index, end: match.index + match[0].length }));
         }
      }
   }
   const chicago = deepFreeze(validate('chicago', { version: 1, inputHash: source.hash, targetEdition: 18,
      rules: chicagoRules.map((rule) => ({ ...rule, status: config.rules[rule.ruleId] === 'off' ? 'disabled' : 'candidates-only' })) }));
   return { chicago, checks, findings };
}
