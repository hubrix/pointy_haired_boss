import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { checkProse } from '../../src/check/check.mjs';
import { planCleanup, validateCleanupPlan } from '../../src/unicode/clean.mjs';
import { validate } from '../../src/contracts/validate.mjs';

const config = (settings = {}) => resolveConfig({ invocation: { version: 1, ...settings } }).config;
const clean = (input, settings, options) => planCleanup(input, config(settings), options);
const scan = (input, settings, options) => checkProse(input, config(settings), options);
const remove = { unicode: { remove: ['U+200B', 'U+00AD', 'U+2060', 'U+FEFF'] } };

test('pinned Unicode data matches its recorded hashes, record counts, and license', async () => {
   const root = new URL('../../data/', import.meta.url);
   const manifest = JSON.parse(await readFile(new URL('unicode-manifest.json', root), 'utf8'));
   const bytes = await readFile(new URL(manifest.generated.file, root));
   assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.generated.sha256);
   const data = JSON.parse(bytes);
   assert.equal(data.version, '17.0.0');
   assert.equal(Object.keys(data.characters).length, 6611);
   assert.equal(data.emoji.length, 2923);
   const license = await readFile(new URL('UNICODE-LICENSE.txt', root));
   assert.equal(createHash('sha256').update(license).digest('hex'), manifest.sources.license.sha256);
   assert.match(license.toString(), /UNICODE LICENSE V3/);
});

test('check completes all six Unicode inventories and includes them in default required coverage', () => {
   const result = scan('Maya approved the report.');
   assert.equal(result.report.requestedCoverage, 'complete');
   assert.equal(result.report.coverage, 'partial');
   assert.deepEqual(result.report.checks.filter((item) => item.required).map((item) => item.id),
      ['boundaries', 'LEX-01', 'UNI-01', 'UNI-02', 'UNI-03', 'UNI-04', 'UNI-05', 'UNI-06']);
   validate('unicode', result.unicode);
});

test('inventory names, scalar columns, UTF-16 ranges, CRLF, and contexts describe original characters', () => {
   const input = '😀\r\nA\u200B字\u{E0100}.';
   const result = scan(input);
   const [space, variation] = result.unicode.items;
   assert.equal(space.name, 'ZERO WIDTH SPACE');
   assert.deepEqual(space.span, { start: 5, end: 6, text: '\u200B', startLocation: { line: 2, column: 2 }, endLocation: { line: 2, column: 3 } });
   assert.equal(variation.name, 'VARIATION SELECTOR-17');
   assert.equal(variation.span.end - variation.span.start, 2);
   assert.equal(variation.span.startLocation.column, 4);
   assert.equal(space.certainty, 'unknown');
   assert.match(variation.context.before, /<U\+200B>/);
   assert.equal(result.unicode.inputHash, result.report.input.hash);
});

test('conservative cleanup strips the complete initial BOM run and leaves other artifacts for review', () => {
   const input = '\uFEFF\uFEFFre\u200Bport soft\u00ADhyphen a\u2060b x\uFEFFy';
   const result = clean(input);
   assert.equal(result.cleanup.outputText, input.slice(2));
   assert.equal(result.cleanup.edits.length, 2);
   assert.equal(result.cleanup.remaining, 4);
   assert.equal(result.cleanup.exitCode, 1);
   assert.equal(clean(result.cleanup.outputText).cleanup.edits.length, 0);
   assert.equal(clean(input, { unicode: { bom: 'preserve' } }).cleanup.outputText, input);
   validate('cleanup', result.cleanup);
});

test('explicit removal applies only inside ASCII words and stays idempotent for mixed artifact runs', () => {
   const input = '\uFEFFre\u200B\u00AD\u2060\uFEFFport\r\nword\u200B boundary ภาษา\u200Bไทย';
   const result = clean(input, remove);
   assert.equal(result.cleanup.outputText, 'report\r\nword\u200B boundary ภาษา\u200Bไทย');
   assert.equal(result.cleanup.edits.length, 5);
   assert.equal(clean(result.cleanup.outputText, remove).cleanup.edits.length, 0);
   for (const edit of result.cleanup.edits) {
      assert.equal(input.slice(edit.range.start, edit.range.end), edit.original);
      assert.equal(edit.inputHash, result.report.input.hash);
      assert.equal(edit.replacement, '');
   }
});

for (const [name, input] of [
   ['Persian joiner', 'می\u200Cروم'],
   ['Indic joiners', 'क्\u200Dष क्\u200Cष'],
   ['emoji family and profession', '👨‍👩‍👧‍👦 👩🏽‍💻'],
   ['emoji presentation and keycap', '❤️ 1️⃣'],
   ['England emoji tag sequence', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
   ['variation selectors', '字\uFE00 字\u{E0100}'],
   ['accents and names', 'cafe\u0301 Åsa Zoë'],
   ['locale and unit spaces', 'Bonjour\u202F! 10\u00A0kg 10\u2009kg'],
   ['line and paragraph separators', 'one\u2028two\u2029three'],
   ['compatibility characters', 'ﬁ Ａ ① ℌ 𝑥 µ'],
   ['mixed-direction isolates', 'שלום \u2066OpenAI\u2069'],
   ['bidi overrides', 'abc\u202Edef\u202C'],
   ['unrecognized invisible tags', 'text\u{E0061}\u{E0062}\u{E007F}'],
]) test(`cleanup preserves ${name} with explicit artifact removal enabled`, () => {
   const result = clean(input, remove);
   assert.equal(result.cleanup.outputText, input);
   assert.equal(result.cleanup.edits.length, 0);
   assert.equal(clean(result.cleanup.outputText, remove).cleanup.outputText, input);
   assert.ok(result.unicode.items.length);
});

test('recognized emoji and ordinary combining marks are inventory entries without violation findings', () => {
   const result = scan('👩🏽‍💻 ❤️ cafe\u0301 10\u00A0kg');
   assert.equal(result.report.findings.filter((item) => item.ruleId.startsWith('UNI-')).length, 0);
   assert.ok(result.unicode.items.some((item) => item.certainty === 'recognized'));
   assert.ok(result.unicode.items.every((item) => item.action === 'preserve'));
});

test('standalone selectors, joiners, orphan combining marks, and controls stay review-only', () => {
   const input = '\uFE0F a\u200Db\n\n\u0301 x\u001By';
   const result = clean(input, remove, { format: 'text' });
   assert.ok(result.unicode.items.every((item) => item.action === 'review'));
   assert.equal(result.cleanup.outputText, input);
   assert.equal(result.cleanup.exitCode, 1);
   assert.ok(result.unicode.items.some((item) => item.name === 'ESCAPE'));
});

test('code, quotes, front matter, links, math, raw HTML, and locks remain byte-for-byte intact', () => {
   const protectedText = '---\ntitle: re\u200Bport\n---\n\n`re\u200Bport` “re\u200Bport” $re\u200Bport$\n\n[link](https://re\u200Bport.example)\n\n<div>re\u200Bport</div>\n\n<!-- phb:lock {"reason":"Approved source"} -->\n\nre\u200Bport\n\n<!-- phb:unlock -->';
   const input = `\uFEFF\uFEFF${protectedText}\n\nre\u200Bport`;
   const result = clean(input, remove, { trustedDirectives: true });
   assert.equal(result.cleanup.outputText, `${protectedText}\n\nreport`);
   assert.equal(result.cleanup.edits.length, 3);
   assert.ok(result.unicode.items.filter((item) => item.scope === 'protected').every((item) => item.action === 'preserve'));
   const literal = 'Use \\u200B or &#x200B; as examples.';
   assert.equal(clean(literal, remove).unicode.items.length, 0);
});

test('incomplete boundaries block cleanup, including otherwise approved BOM removal', () => {
   const input = '\uFEFFAn “unclosed quotation with re\u200Bport.';
   const result = clean(input, remove);
   assert.equal(result.cleanup.exitCode, 2);
   assert.equal(result.cleanup.outputText, input);
   assert.equal(result.cleanup.edits.length, 0);
});

test('disabled rules and explicit suppressions cannot produce cleanup edits', () => {
   const input = '\uFEFFre\u200Bport';
   assert.equal(clean(input, { ...remove, rules: { 'UNI-01': 'off' } }).cleanup.edits.length, 0);
   const result = clean(input, { ...remove, suppressions: [{ ruleIds: ['UNI-01'], reason: 'Required original bytes' }] });
   assert.equal(result.cleanup.edits.length, 0);
   assert.ok(result.unicode.items.every((item) => /Suppressed/.test(item.reason)));
   const inline = '<!-- phb:suppress {"ruleIds":["UNI-01"],"reason":"Required layout"} -->\n\nre\u200Bport\n\n<!-- phb:resume -->';
   assert.equal(clean(inline, remove, { trustedDirectives: true }).cleanup.edits.length, 0);
});

test('selected cleanup preserves outside characters and maps the resulting selection', () => {
   const input = 're\u200Bport re\u200Bport';
   const result = clean(input, remove, { selection: { start: 8, end: input.length } });
   assert.equal(result.cleanup.outputText, 're\u200Bport report');
   assert.deepEqual(result.cleanup.outputSelection, { start: 8, end: input.length - 1 });
   assert.equal(result.cleanup.edits.length, 1);
   assert.equal(clean('\uFEFF', {}, { selection: { start: 0, end: 1 } }).cleanup.outputText, '');
});

test('cleanup revalidation rejects stale source, changed policy, overlap, and forged output', () => {
   const input = '\uFEFFre\u200Bport';
   const settings = config(remove);
   const plan = planCleanup(input, settings);
   assert.doesNotThrow(() => validateCleanupPlan(input, plan, settings));
   assert.throws(() => validateCleanupPlan(`${input}!`, plan, settings), /stale/);
   assert.throws(() => validateCleanupPlan(input, plan, config()), /stale/);
   for (const alter of [
      (copy) => { copy.cleanup.outputText = 'invented'; },
      (copy) => { copy.cleanup.edits.push(copy.cleanup.edits[0]); },
      (copy) => { copy.cleanup.edits[0].range.end = input.length; },
   ]) {
      const copy = structuredClone(plan); alter(copy);
      assert.throws(() => validateCleanupPlan(input, copy, settings), /stale/);
   }
});

test('unsupported destructive policies and incomplete required checks fail', () => {
   for (const unicode of [{ remove: ['U+200D'] }, { remove: ['U+2066'] }, { bom: 'strip' }, { remove: ['U+200B', 'U+200B'] }]) {
      assert.throws(() => config({ unicode }));
   }
   const result = clean('\uFEFFtext', {}, { requestedChecks: ['LEX-01'] });
   assert.equal(result.cleanup.exitCode, 2);
   assert.equal(result.cleanup.edits.length, 0);
});
