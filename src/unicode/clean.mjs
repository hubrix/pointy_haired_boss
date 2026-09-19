import { isDeepStrictEqual } from 'node:util';
import { createSource } from '../contracts/source.mjs';
import { buildReport } from '../contracts/report.mjs';
import { validate, ContractError } from '../contracts/validate.mjs';
import { overlaps } from '../contracts/phrases.mjs';
import { parseProse } from '../check/parser.mjs';
import { inventoryUnicode, unicodeRuleIds } from './inventory.mjs';

function applyEdits(source, edits, protectedSpans) {
   let previousEnd = -1;
   for (const edit of edits) {
      const span = source.span(edit.range.start, edit.range.end);
      if (edit.inputHash !== source.hash || edit.original !== span.text || edit.replacement !== '' ||
          edit.range.start < previousEnd || edit.range.end <= edit.range.start ||
          protectedSpans.some((range) => overlaps(range, edit.range))) throw new ContractError('Invalid or overlapping cleanup edit');
      previousEnd = edit.range.end;
   }
   const pieces = [];
   let offset = 0;
   for (const edit of edits) { pieces.push(source.text.slice(offset, edit.range.start)); offset = edit.range.end; }
   pieces.push(source.text.slice(offset));
   return pieces.join('');
}

export function planCleanup(input, config, { path, requestedChecks, threshold = 'suggestion', ...parserOptions } = {}) {
   const source = createSource(input);
   const parsed = parseProse(source, parserOptions);
   const unicode = inventoryUnicode(source, config, parsed, { path, selection: parserOptions.selection });
   const requested = requestedChecks ?? unicodeRuleIds.filter((id) => config.rules[id] !== 'off');
   const makeReport = (source, parsed, unicode) => buildReport({ source, config, path,
      requestedChecks: requested, checks: [parsed.check, ...unicode.checks], findings: unicode.findings,
      protectedSpans: parsed.protectedSpans, inlineSuppressions: parsed.inlineSuppressions, threshold });
   const report = makeReport(source, parsed, unicode);
   const edits = report.exitCode === 2 ? [] : unicode.edits;
   const outputText = applyEdits(source, edits, parsed.protectedSpans);
   const outputSource = createSource(outputText);
   const removedUnits = edits.reduce((count, edit) => count + edit.original.length, 0);
   const outputSelection = parserOptions.selection ? { ...parserOptions.selection, end: parserOptions.selection.end - removedUnits } : null;
   // A fully consumed selection can be empty after cleanup. Parse the full output
   // for boundaries and then limit inventory to that (possibly empty) range.
   const afterParsed = parseProse(outputSource, { ...parserOptions, selection: undefined });
   const afterUnicode = inventoryUnicode(outputSource, config, afterParsed, { path, selection: outputSelection });
   const afterReport = makeReport(outputSource, afterParsed, afterUnicode);
   if (report.exitCode !== 2 && (afterUnicode.edits.length || afterReport.exitCode === 2)) {
      throw new ContractError('Cleanup would expose further edits or lose boundary coverage; no changes applied');
   }
   const cleanup = validate('cleanup', { version: 1, inputHash: source.hash, outputHash: outputSource.hash,
      outputText, edits, applied: false, remaining: afterUnicode.inventory.items.filter((item) => item.action === 'review').length,
      outputSelection, afterReport, exitCode: report.exitCode === 2 ? 2 : edits.length ? 1 : afterReport.exitCode });
   return { report, unicode: unicode.inventory, boundaries: { protectedSpans: parsed.protectedSpans, issues: parsed.issues },
      selection: parserOptions.selection ?? null, cleanup };
}

export function validateCleanupPlan(input, plan, config, options) {
   validate('cleanup', plan.cleanup);
   const fresh = planCleanup(input, config, options);
   if (!isDeepStrictEqual(fresh, plan)) throw new ContractError('Cleanup plan is stale or does not match the source and current policy');
   if (fresh.cleanup.exitCode === 2) throw new ContractError('Required cleanup coverage is incomplete');
   return fresh;
}
