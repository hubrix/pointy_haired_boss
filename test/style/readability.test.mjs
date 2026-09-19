import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProse } from '../../src/check/check.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { gradeLevel, measureReadability } from '../../src/style/readability.mjs';
import { createSource } from '../../src/contracts/source.mjs';
import { parseProse } from '../../src/check/parser.mjs';

const check = (text, settings = {}, options = {}) => checkProse(text,
   resolveConfig({ project: { version: 1, readability: { minWords: 1 }, ...settings } }).config, options);
const metric = (text, settings, options) => check(text, settings, options).readability;
const simple = 'The cat sat on the mat. The dog ran to the gate.';
const dense = 'Implementation of the methodology necessitates consideration of interdependencies.';

test('known counts use the documented formula without clamping negative grades', () => {
   const result = metric(simple);
   assert.equal(result.words, 12);
   assert.equal(result.sentences, 2);
   assert.equal(result.syllables, 12);
   assert.ok(Math.abs(result.grade - (-1.45)) < 1e-10);
   assert.equal(result.aboveTarget, false);
   assert.equal(gradeLevel(100, 5, 150), 9.91);
   for (const values of [[0, 1, 1], [1, 0, 1], [1, 1, 0], [-1, 1, 1], [1.5, 1, 1], [Infinity, 1, 1]]) assert.equal(gradeLevel(...values), null);
});

test('grade-eight warning uses an unrounded comparison and preserves the entire input', () => {
   const result = check((dense + ' ').repeat(15), {}, { threshold: 'warning', requestedChecks: ['READ-01'] });
   const finding = result.report.findings.find((item) => item.ruleId === 'READ-01');
   assert.equal(finding.status, 'confirmed');
   assert.equal(finding.evidence, 'heuristic');
   assert.equal(finding.ruleSeverity, 'warning');
   assert.equal(finding.fix, undefined);
   assert.equal(finding.span.text, 'Implementation');
   assert.equal(result.report.exitCode, 1);
   assert.match(finding.reason, /Preserve facts/);
   const grade = result.readability.grade;
   assert.equal(metric((dense + ' ').repeat(15), { readability: { minWords: 1, targetMaxGrade: grade } }).aboveTarget, false);
   assert.equal(metric((dense + ' ').repeat(15), { readability: { minWords: 1, targetMaxGrade: grade - 0.0001 } }).aboveTarget, true);
});

test('default minimum is 100 words; short samples have no grade and explicit required coverage fails', () => {
   const config = resolveConfig().config;
   const short = checkProse('The cat sat on the mat.', config, { requestedChecks: ['READ-01'] });
   assert.equal(short.readability.status, 'insufficient-sample');
   assert.equal(short.readability.grade, null);
   assert.equal(short.readability.aboveTarget, null);
   assert.equal(short.report.exitCode, 2);
   assert.equal(checkProse(('The cat sat on the mat. ').repeat(17), config, { requestedChecks: ['READ-01'] }).readability.status, 'measured');
   assert.equal(checkProse(('The cat sat on the mat. ').repeat(16), config).readability.status, 'insufficient-sample');
   assert.equal(checkProse('We met in 2026.', config).readability.status, 'insufficient-sample');
});

test('no eligible prose is distinct from a zero-grade success', () => {
   for (const text of ['', '# The cat sat on the mat.', '`The cat sat on the mat.`', '> The cat sat on the mat.', 'A fragment without final punctuation']) {
      const result = metric(text);
      assert.equal(result.status, 'no-eligible-prose', text);
      assert.equal(result.grade, null);
   }
});

test('Markdown structure excludes headings and tables while list sentences remain eligible', () => {
   const input = '# Complex words in a heading.\n\n| Column | Other |\n| --- | --- |\n| Difficult methodology. | Three words here. |\n\n- The cat sat on the mat.\n- The dog ran to the gate.\n- Plain fragment';
   const result = metric(input);
   assert.equal(result.words, 12);
   assert.equal(result.sentences, 2);
   assert.equal(result.excluded.structure, 5);
   assert.equal(result.excluded.fragment, 1);
});

test('soft wraps, CRLF, Markdown emphasis, entities, and link labels preserve counts and source coordinates', () => {
   const input = 'The **cat** sat\r\non the [mat](https://example.com). The dog ran to the g&#97;te.';
   const result = metric(input);
   assert.equal(result.words, 12);
   assert.equal(result.sentences, 2);
   assert.equal(result.syllables, 12);
   assert.equal(input.slice(result.units[0].range.start, result.units[0].range.end), 'The **cat** sat\r\non the [mat](https://example.com).');
   const warning = check('Implementation of [methodology](https://example.com) necessitates consideration of interdependencies.', {}, { threshold: 'warning' });
   assert.equal(warning.report.findings.find((item) => item.ruleId === 'READ-01').status, 'confirmed');
});

test('quotes, code, citations, URLs, math, and locks exclude whole affected sentences without joining fragments', () => {
   for (const embedded of ['“hard words”', '`hard words`', '(Jones 2024)', '[1]', 'https://example.com', '$x+y$']) {
      const result = metric(`We use ${embedded} in prose. ${simple}`);
      assert.equal(result.words, 12, embedded);
      assert.equal(result.sentences, 2, embedded);
      assert.equal(result.excluded.protected, 1, embedded);
   }
   const locked = '<!-- phb:lock {"reason":"Exact copy"} -->\n\n' + dense + '\n\n<!-- phb:unlock -->\n\n' + simple;
   assert.equal(metric(locked, {}, { trustedDirectives: true }).words, 12);
});

test('sentence segmentation handles title abbreviations, contractions, compounds, and accents', () => {
   const title = metric('Dr. Smith left. We went home.');
   assert.deepEqual([title.words, title.sentences, title.syllables], [6, 2, 7]);
   const compound = metric('We sent twenty-one reports. They can’t wait.');
   assert.deepEqual([compound.words, compound.sentences, compound.syllables], [7, 2, 10]);
   assert.equal(metric('The café serves tea.').status, 'measured');
});

for (const [name, text, token] of [
   ['decimal', 'We paid 3.50 dollars. We went home.', '3.50'],
   ['year', 'We met in 2026.', '2026'],
   ['initialism', 'We use HTML.', 'HTML'],
   ['mixed identifier', 'We use Node.js.', 'Node.js'],
   ['non-Latin word', 'We say привет.', 'привет'],
]) test(`undefined pronunciation prevents a favorable grade: ${name}`, () => {
   const result = check(text, {}, { requestedChecks: ['READ-01'] });
   assert.equal(result.readability.status, 'unsupported-tokens');
   assert.equal(result.readability.grade, null);
   assert.equal(result.readability.syllables, null);
   assert.equal(result.readability.unsupportedTokens[0].span.text, token);
   assert.equal(result.report.exitCode, 2);
});

test('selections include only full original sentences and never manufacture short words', () => {
   assert.equal(metric(simple, {}, { selection: { start: 24, end: simple.length } }).words, 6);
   assert.equal(metric(simple, {}, { selection: { start: 2, end: 23 } }).status, 'no-eligible-prose');
   assert.equal(metric(simple, {}, { selection: { start: 0, end: simple.length - 1 } }).sentences, 1);
});

test('incomplete boundaries block the metric even when other paragraphs are eligible', () => {
   const result = metric(simple + '\n\nMaya said “unfinished.');
   assert.equal(result.status, 'incomplete-boundaries');
   assert.equal(result.grade, null);
});

test('readability honors disabling and documented suppression without making source edits', () => {
   const disabled = check(dense, { rules: { 'READ-01': 'off' } });
   assert.equal(disabled.readability.status, 'disabled');
   assert.ok(!disabled.report.findings.some((item) => item.ruleId === 'READ-01'));
   const suppressed = check(dense, { suppressions: [{ ruleIds: ['READ-01'], reason: 'Technical audience' }] });
   assert.equal(suppressed.report.findings.find((item) => item.ruleId === 'READ-01').status, 'suppressed');
   const text = '<!-- phb:suppress {"ruleIds":["READ-01"],"reason":"Source terminology"} -->\n\n' + dense + '\n\n<!-- phb:resume -->\n\n' + simple;
   const metricResult = metric(text, {}, { trustedDirectives: true });
   assert.equal(metricResult.words, 12);
   assert.equal(metricResult.excluded.suppression, 1);
});

test('readability evidence and method metadata are immutable', () => {
   const result = metric(simple);
   assert.equal(result.sentenceParser, 'parse-english@7.0.0');
   assert.equal(result.syllableEstimator, 'syllable@5.0.1');
   assert.throws(() => { result.units[0].words = 1; }, TypeError);
});

test('ordinary words matching object property names remain valid prose', () => {
   const result = metric('The constructor takes a value. The prototype defines a method.');
   assert.equal(result.status, 'measured');
   assert.equal(result.words, 10);
   assert.ok(Number.isFinite(result.grade));
});

test('a word-level exemption cannot suppress a document-level metric warning', () => {
   const source = createSource(dense);
   const parsed = parseProse(source);
   parsed.inlineSuppressions = [{ version: 1, ruleIds: ['READ-01'], range: { start: 0, end: 14 }, reason: 'Required term' }];
   const config = resolveConfig({ project: { version: 1, readability: { minWords: 1 } } }).config;
   const result = measureReadability(source, config, parsed);
   assert.equal(result.readability.words, 8);
   assert.equal(result.findings[0].status, 'confirmed');
   assert.equal(result.findings[0].span.text, 'of');
});
