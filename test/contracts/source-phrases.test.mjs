import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSource } from '../../src/contracts/source.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { findPhraseMatches, resolveExemption, validateSuppression } from '../../src/contracts/phrases.mjs';

test('source preserves UTF-8 BOM, combining marks, emoji, and newline bytes', () => {
   const bytes = Buffer.from('\ufeff👩🏽‍💻 cafe\u0301\r\nNext\rLast\n', 'utf8');
   const source = createSource(bytes);
   assert.deepEqual(Buffer.from(source.text, 'utf8'), bytes);
   assert.equal(source.hash, createHash('sha256').update(bytes).digest('hex'));
   assert.equal(source.byteLength, bytes.length);
   assert.deepEqual(source.location(source.text.indexOf('Next')), { line: 2, column: 1 });
   assert.deepEqual(source.location(source.text.indexOf('Last')), { line: 3, column: 1 });
   assert.deepEqual(source.location(source.text.length), { line: 4, column: 1 });
   assert.deepEqual(source.location(source.text.indexOf('cafe')), { line: 1, column: 7 });
});

test('invalid UTF-8 and unpaired UTF-16 never become replacement characters', () => {
   for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff]]) assert.throws(() => createSource(Uint8Array.from(bytes)), /valid UTF-8/);
   assert.throws(() => createSource('\ud800'), /unpaired/);
   assert.equal(createSource('\ufffd').text, '\ufffd');
});

test('source ranges reject split surrogates, split CRLF, reversed and out-of-bounds spans', () => {
   const source = createSource('😀\r\nA');
   assert.throws(() => source.location(1), /surrogate/);
   assert.throws(() => source.span(2, 3), /CRLF/);
   assert.throws(() => source.span(5, 4), /before/);
   for (const index of [-1, 9, 1.5, NaN]) assert.throws(() => source.location(index), /outside/);
   assert.deepEqual(createSource('').location(0), { line: 1, column: 1 });
});

test('exact terms avoid longer words, contractions, combining suffixes, and astral letters', () => {
   const source = createSource('test contest tested test_case test\u0301 𐐀test test𐐀 test-test');
   assert.deepEqual(findPhraseMatches(source, 'test').map((range) => source.span(range.start, range.end).text), ['test', 'test', 'test']);
   assert.deepEqual(findPhraseMatches(createSource("we we're we’re"), 'we'), [{ start: 0, end: 2 }]);
   assert.deepEqual(findPhraseMatches(createSource("'we'"), 'we'), [{ start: 1, end: 3 }]);
   assert.deepEqual(findPhraseMatches(createSource('a a a'), 'a a'), [{ start: 0, end: 3 }, { start: 2, end: 5 }]);
});

test('phrase matching defines case, horizontal whitespace, and literal punctuation', () => {
   const source = createSource('DELVE\tinto. Delve\u00a0into. delve\ninto. delve into.');
   assert.equal(findPhraseMatches(source, 'delve into').length, 3);
   assert.equal(findPhraseMatches(source, 'delve into', { caseSensitive: true }).length, 1);
   assert.equal(findPhraseMatches(source, 'delve into', { whitespace: 'literal' }).length, 1);
   assert.equal(findPhraseMatches(createSource('C++ C++ish a.b axb'), 'C++').length, 1);
   assert.equal(findPhraseMatches(createSource('C++ C++ish a.b axb'), 'a.b').length, 1);
});

test('allowlists exempt complete lexical matches without disabling grammar rules', () => {
   const source = createSource('robust regression and robust claims');
   const { config } = resolveConfig();
   const [first, second] = findPhraseMatches(source, 'robust');
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range: first }).kind, 'allowlist');
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range: second }), undefined);
   assert.equal(resolveExemption({ source, config, ruleId: 'GRAM-01', range: first }), undefined);
});

test('inline suppressions need full containment, known rules, and a reason', () => {
   const source = createSource('delve into');
   const range = { start: 0, end: 10 };
   const { config } = resolveConfig();
   const suppression = { version: 1, ruleIds: ['LEX-01'], range, reason: 'Quoted example' };
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range, inlineSuppressions: [suppression] }).kind, 'inline');
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range, inlineSuppressions: [{ ...suppression, range: { start: 0, end: 5 } }] }), undefined);
   assert.throws(() => validateSuppression(source, { ...suppression, reason: '' }), /suppression/);
   assert.throws(() => validateSuppression(source, { ...suppression, ruleIds: ['FID-04'] }), /Fidelity/);
   assert.throws(() => validateSuppression(source, { ...suppression, range: { start: 0, end: 20 } }), /outside/);
});

test('path-scoped suppressions cannot escape their configured paths', () => {
   const source = createSource('delve into');
   const range = { start: 0, end: 10 };
   const { config } = resolveConfig({ project: { version: 1, suppressions: [{ ruleIds: ['LEX-01'], paths: ['examples/**'], reason: 'Literal examples' }] } });
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range, path: 'examples/a.md' }).kind, 'configuration');
   assert.equal(resolveExemption({ source, config, ruleId: 'LEX-01', range, path: 'docs/a.md' }), undefined);
});
