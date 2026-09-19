import { ParseEnglish } from 'parse-english';
import { syllable } from 'syllable';
import { createFinding } from '../contracts/report.mjs';
import { overlaps } from '../contracts/phrases.mjs';
import { deepFreeze } from '../contracts/catalog.mjs';
import { validate } from '../contracts/validate.mjs';
import { sourceRange } from '../check/parser.mjs';

const parser = new ParseEnglish();
const lexicalWord = /^[\p{Script=Latin}\p{M}]+(?:['’\-\u2011][\p{Script=Latin}\p{M}]+)*$/u;
const titles = { 'Dr.': 2, 'Mr.': 2, 'Mrs.': 2, 'Ms.': 1 };
function nodesOfType(node, type) {
   return node.type === type ? [node] : (node.children ?? []).flatMap((child) => nodesOfType(child, type));
}

export function gradeLevel(words, sentences, syllables) {
   if (![words, sentences, syllables].every((value) => Number.isInteger(value) && value > 0)) return null;
   return 0.39 * words / sentences + 11.8 * syllables / words - 15.59;
}

export function measureReadability(source, config, parsed, { path, selection } = {}) {
   const units = [];
   const unsupportedTokens = [];
   const excluded = { structure: 0, protected: 0, selection: 0, fragment: 0, suppression: 0, empty: 0 };
   const disabled = config.rules['READ-01'] === 'off';
   if (!disabled) for (const block of parsed.proseBlocks) {
      if (block.kind !== 'paragraph') { excluded.structure++; continue; }
      // Soft line wraps must not introduce new sentences. Keep UTF-16 offsets.
      const text = block.text.replace(/[\r\n]/g, ' ');
      for (const sentence of nodesOfType(parser.parse(text), 'SentenceNode')) {
         let start = sentence.position.start.offset;
         let end = sentence.position.end.offset;
         while (start < end && /\s/u.test(text[start])) start++;
         while (end > start && /\s/u.test(text[end - 1])) end--;
         if (end <= start) continue;
         const maps = block.map.slice(start, end);
         const mapped = maps.filter(Boolean);
         if (!mapped.length) { excluded.protected++; continue; }
         const range = { start: mapped[0].start, end: mapped.at(-1).end };
         if (selection && (range.start < selection.start || range.end > selection.end)) { excluded.selection++; continue; }
         if (maps.some((unit) => !unit || parsed.protectedSpans.some((span) => overlaps(span, unit)))) {
            excluded.protected++; continue;
         }
         // A partial suppression cannot exempt the rest of a sentence. Leave
         // its metric visible; only fully contained units leave the sample.
         if (parsed.inlineSuppressions.some((item) => item.ruleIds.includes('READ-01') &&
             item.range.start <= range.start && item.range.end >= range.end)) { excluded.suppression++; continue; }
         if (!/[.!?][)\]]*$/u.test(text.slice(start, end))) { excluded.fragment++; continue; }
         const words = nodesOfType(sentence, 'WordNode');
         if (!words.length) { excluded.empty++; continue; }
         const anchor = words.map((word) => sourceRange(block, {
            start: word.position.start.offset, end: word.position.end.offset,
         })).find((word) => !parsed.inlineSuppressions.some((item) => item.ruleIds.includes('READ-01') &&
            item.range.start <= word.start && item.range.end >= word.end));
         if (!anchor) { excluded.suppression++; continue; }
         let total = 0;
         let unsupported = false;
         for (const word of words) {
            const wordRange = { start: word.position.start.offset, end: word.position.end.offset };
            const value = text.slice(wordRange.start, wordRange.end);
            let count = Object.hasOwn(titles, value) ? titles[value] : undefined;
            if (count === undefined && lexicalWord.test(value) && !/^[A-Z]{2,}s?$/.test(value)) count = syllable(value.replaceAll('’', "'").replaceAll('\u2011', '-'));
            if (!count) {
               unsupported = true;
               const original = sourceRange(block, wordRange);
               unsupportedTokens.push({ span: source.span(original.start, original.end),
                  reason: 'Pronunciation is not defined for this number, abbreviation, symbol, or non-Latin token.' });
            } else total += count;
         }
         units.push({ range, anchor, words: words.length, syllables: unsupported ? null : total });
      }
   }
   const words = units.reduce((sum, unit) => sum + unit.words, 0);
   const syllables = unsupportedTokens.length ? null : units.reduce((sum, unit) => sum + unit.syllables, 0);
   const status = disabled ? 'disabled' : parsed.check.status !== 'complete' ? 'incomplete-boundaries' :
      !words ? 'no-eligible-prose' : words < config.readability.minWords ? 'insufficient-sample' :
      unsupportedTokens.length ? 'unsupported-tokens' : 'measured';
   const grade = status === 'measured' ? gradeLevel(words, units.length, syllables) : null;
   const reasons = {
      disabled: 'READ-01 is disabled.', 'incomplete-boundaries': 'Resolve incomplete prose boundaries before interpreting readability.',
      'no-eligible-prose': 'No complete, unprotected body-prose sentences are eligible.',
      'unsupported-tokens': 'A grade is unavailable because some word pronunciations are undefined. Preserve the tokens; review readability in context.',
      'insufficient-sample': `The sample has ${words} eligible words; at least ${config.readability.minWords} are required.`,
      measured: 'Flesch–Kincaid estimate for eligible body prose; it does not measure comprehension or establish editorial compliance.',
   };
   const readability = deepFreeze(validate('readability', { version: 1, inputHash: source.hash,
      metric: 'flesch-kincaid', method: 'phb-english-1', sentenceParser: 'parse-english@7.0.0', syllableEstimator: 'syllable@5.0.1',
      status, reason: reasons[status], targetMaxGrade: config.readability.targetMaxGrade, minWords: config.readability.minWords,
      words, sentences: units.length, syllables, grade, aboveTarget: grade === null ? null : grade > config.readability.targetMaxGrade,
      units, excluded, unsupportedTokens }));
   const checks = disabled ? [] : [{ id: 'READ-01', status: grade === null ? 'partial' : 'complete', reason: reasons[status] }];
   const findings = [];
   if (readability.aboveTarget) findings.push(createFinding({ source, config, path,
      protectedSpans: parsed.protectedSpans, inlineSuppressions: parsed.inlineSuppressions,
      ruleId: 'READ-01', range: units[0].anchor, evidence: 'heuristic',
      reason: `Eligible prose estimates grade ${grade.toFixed(2)}, above the ${config.readability.targetMaxGrade} target (${words} words, ${units.length} sentences). This document-level finding is anchored at its first unsuppressed measured word. Preserve facts, terms, negation, and modality; review sentence structure and explanations.` }));
   return { readability, checks, findings };
}
