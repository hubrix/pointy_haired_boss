import { ContractError, validate } from './validate.mjs';
import { matchesPath } from './config.mjs';
import { findPhraseMatches } from './matching.mjs';
export { findPhraseMatches } from './matching.mjs';

const contained = (outer, inner) => inner.start >= outer.start && inner.end <= outer.end;
export const overlaps = (left, right) => left.start < right.end && right.start < left.end;

export function validateSuppression(source, suppression) {
   validate('suppression', suppression);
   source.span(suppression.range.start, suppression.range.end);
   if (suppression.range.end <= suppression.range.start) throw new ContractError('Suppression must cover a nonempty source range');
   if (suppression.ruleIds.some((id) => id.startsWith('FID-'))) throw new ContractError('Fidelity checks cannot be suppressed');
   return suppression;
}

export function resolveExemption({ source, ruleId, range, config, path, inlineSuppressions = [], protectedSpans = [] }) {
   source.span(range.start, range.end);
   for (const span of protectedSpans) source.span(span.start, span.end);
   for (const suppression of inlineSuppressions) validateSuppression(source, suppression);
   if (ruleId.startsWith('FID-')) return undefined;
   const inline = inlineSuppressions.find((item) => item.ruleIds.includes(ruleId) && contained(item.range, range));
   if (inline) return { kind: 'inline', reason: inline.reason };
   const configured = config.suppressions.find((item) => item.ruleIds.includes(ruleId) && (!item.paths || matchesPath(path, item.paths)));
   if (configured) return { kind: 'configuration', reason: configured.reason };
   const protectedMatch = protectedSpans.find((span) => overlaps(span, range));
   if (protectedMatch) return { kind: 'protected', reason: protectedMatch.reason ?? 'The finding intersects protected source content.' };
   if (ruleId.startsWith('LEX-')) {
      for (const term of config.allowedTerms) {
         if (findPhraseMatches(source, term, config.matching).some((span) => contained(span, range))) {
            return { kind: 'allowlist', reason: `Allowed term: ${term}` };
         }
      }
   }
   return undefined;
}
