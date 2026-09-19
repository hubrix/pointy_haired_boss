import test from 'node:test';
import assert from 'node:assert/strict';
import { TextlintKernel } from '@textlint/kernel';
import markdown from '@textlint/textlint-plugin-markdown';
import { parseMarkdown as remark } from './remark.mjs';
import { parseMarkdown as textlint } from './textlint.mjs';
import { proseSpans, sentinelHits, applyPatches, inputHash, location } from './spans.mjs';
import { fixtures, expectedHits, boundaryGaps } from './fixtures.mjs';
import { grammarCandidates } from './grammar.mjs';

for (const fixture of fixtures) {
   test(`remark protected spans: ${fixture.id}`, () => {
      const spans = proseSpans(remark(fixture.source), fixture.source);
      assert.deepEqual(sentinelHits(spans), expectedHits(fixture));
      for (const span of spans) assert.equal(fixture.source.slice(span.start, span.end), span.raw);
      if (fixture.transformed) assert.ok(spans.some((span) => !span.patchable));
   });
}

test('textlint native kernel can report an exact source range', async () => {
   const kernel = new TextlintKernel();
   const result = await kernel.lintText('Maya quietly agreed.', {
      filePath: 'fixture.md', ext: '.md',
      plugins: [{ pluginId: 'markdown', plugin: markdown.default }],
      rules: [{ ruleId: 'probe', rule: (context) => ({
         Str(node) {
            const index = context.getSource(node).indexOf('quietly');
            if (index >= 0) context.report(node, new context.RuleError('sentinel', {
               padding: context.locator.range([index, index + 7]),
            }));
         },
      }) }],
   });
   assert.equal(result.messages.length, 1);
   assert.equal(result.messages[0].index, 5);
   assert.deepEqual(result.messages[0].range, [5, 12]);
});

test('textlint default Markdown processor exposes math as prose', () => {
   const fixture = fixtures.find((item) => item.id === 'math');
   assert.notDeepEqual(sentinelHits(proseSpans(textlint(fixture.source), fixture.source)), expectedHits(fixture));
});

test('both parsers still need quote, citation, and locked-span policy', () => {
   for (const parse of [remark, textlint]) {
      for (const fixture of boundaryGaps) {
         assert.notDeepEqual(sentinelHits(proseSpans(parse(fixture.source), fixture.source)), expectedHits(fixture));
      }
   }
});

const source = '# 👩🏽‍💻 cafe\u0301\r\n\r\nMaya **quietly** agreed. `quietly`\r\n';
const start = source.indexOf('quietly');
const patch = { start, end: start + 7, original: 'quietly', replacement: 'readily' };
const spans = proseSpans(remark(source), source);

test('patch changes exact source bytes while retaining Markdown, Unicode, and CRLF', () => {
   const output = applyPatches(source, inputHash(source), [patch], spans);
   assert.equal(output, '# 👩🏽‍💻 cafe\u0301\r\n\r\nMaya **readily** agreed. `quietly`\r\n');
   assert.deepEqual(location(source, start), { line: 3, column: 8 });
   assert.deepEqual(location('👩🏽‍💻 cafe\u0301', 7), { line: 1, column: 5 });
});

test('patch refuses stale input and stale expected text', () => {
   assert.throws(() => applyPatches(source + '!', inputHash(source), [patch], spans), /Stale input/);
   assert.throws(() => applyPatches(source, inputHash(source), [{ ...patch, original: 'wrong' }], spans), /Stale original/);
});

test('patch refuses overlap, protected content, and split surrogate pairs', () => {
   assert.throws(() => applyPatches(source, inputHash(source), [patch, patch], spans), /Overlapping/);
   const lockedStart = source.lastIndexOf('quietly');
   assert.throws(() => applyPatches(source, inputHash(source), [{ ...patch, start: lockedStart, end: lockedStart + 7 }], spans), /Protected/);
   assert.throws(() => applyPatches(source, inputHash(source), [{ start: 2, end: 3, original: source.slice(2, 3), replacement: '' }], spans), /Invalid/);
});

test('patch refuses decoded-to-source mapping ambiguity', () => {
   const escaped = '\\*quietly &amp; quietly';
   const decodedSpans = proseSpans(remark(escaped), escaped);
   assert.throws(() => applyPatches(escaped, inputHash(escaped), [{ start: 2, end: 9, original: 'quietly', replacement: '' }], decodedSpans), /Protected or unmapped/);
});

test('grammar candidates distinguish common -ly adjectives and passive lookalikes', () => {
   assert.deepEqual(grammarCandidates('The friendly reviewer approved the report.'), { adverbs: [], passive: false });
   assert.deepEqual(grammarCandidates('Maya works hard.').adverbs, ['hard']);
   assert.equal(grammarCandidates('The report was approved by Maya.').passive, true);
   assert.equal(grammarCandidates('The server is ready.').passive, false);
});

test('grammar probe exposes missing negation and passive-infinitive coverage', () => {
   assert.deepEqual(grammarCandidates('She did not approve it.').adverbs, []);
   assert.equal(grammarCandidates('The report needs to be reviewed.').passive, false);
});
