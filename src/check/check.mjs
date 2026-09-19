import { createSource } from '../contracts/source.mjs';
import { createFinding, buildReport } from '../contracts/report.mjs';
import { findPhraseMatches } from '../contracts/matching.mjs';
import { houseBanIds } from '../contracts/catalog.mjs';
import { parseProse, sourceRange } from './parser.mjs';
import { grammarCandidates } from './candidates.mjs';
import { inventoryUnicode } from '../unicode/inventory.mjs';
import { measureReadability } from '../style/readability.mjs';
import { checkChicago } from '../style/chicago.mjs';

export function checkProse(input, config, { path, requestedChecks, threshold = 'error', ...parserOptions } = {}) {
   const source = createSource(input);
   const parsed = parseProse(source, parserOptions);
   const allowlistMatches = parsed.segments.flatMap((segment) => config.allowedTerms.flatMap((term) =>
      findPhraseMatches(segment, term, config.matching).map((range) => ({ term, ...sourceRange(segment, range) }))));
   const context = { source, config, path, protectedSpans: parsed.protectedSpans, inlineSuppressions: parsed.inlineSuppressions, allowlistMatches };
   const unicode = inventoryUnicode(source, config, parsed, { path, selection: parserOptions.selection });
   const readability = measureReadability(source, config, parsed, { path, selection: parserOptions.selection });
   const chicago = checkChicago(source, config, parsed, { path, selection: parserOptions.selection });
   const checks = [parsed.check, ...unicode.checks, ...readability.checks, ...chicago.checks];
   const findings = [...unicode.findings, ...readability.findings, ...chicago.findings];
   const selected = (range) => !parserOptions.selection ||
      range.start >= parserOptions.selection.start && range.end <= parserOptions.selection.end;
   const activeBans = houseBanIds.filter((id) => config.rules[id] !== 'off');
   if (config.rules['LEX-01'] !== 'off') checks.push({ id: 'LEX-01', status: 'complete' });
   for (const id of activeBans) checks.push({ id, status: 'partial', reason: 'Local candidates only; contextual editorial review is still required.' });
   const phrases = [
      ...config.forbiddenPhrases.map((phrase) => ({ phrase, reason: `Forbidden phrase: ${phrase}` })),
      ...config.requiredTerminology.flatMap((entry) => entry.avoid.map((phrase) => ({ phrase,
         reason: `Required terminology: use “${entry.preferred}” when referring to the same concept as “${phrase}”.` }))),
   ];
   for (const segment of parsed.segments) {
      if (config.rules['LEX-01'] !== 'off') {
         for (const { phrase, reason } of phrases) {
            for (const match of findPhraseMatches(segment, phrase, config.matching)) {
               const range = sourceRange(segment, match);
               if (selected(range)) findings.push(createFinding({ ...context, ruleId: 'LEX-01', range, reason }));
            }
         }
      }
      if (activeBans.length) {
         for (const candidate of grammarCandidates(segment.text)) {
            const range = sourceRange(segment, candidate.range);
            if (activeBans.includes(candidate.ruleId) && selected(range)) findings.push(createFinding({ ...context,
               ...candidate, range, status: 'candidate', evidence: 'heuristic' }));
         }
      }
   }
   findings.sort((a, b) => a.span.start - b.span.start || a.ruleId.localeCompare(b.ruleId));
   const unique = findings.filter((item, index) => !findings.slice(0, index).some((other) =>
      other.ruleId === item.ruleId && other.span.start === item.span.start && other.span.end === item.span.end && other.reason === item.reason));
   return { report: buildReport({ ...context, findings: unique, checks, threshold, requestedChecks }),
   unicode: unicode.inventory,
   readability: readability.readability, chicago: chicago.chicago,
   boundaries: { protectedSpans: parsed.protectedSpans, issues: parsed.issues },
   selection: parserOptions.selection ?? null };
}
