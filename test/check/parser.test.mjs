import test from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../../src/contracts/source.mjs';
import { parseProse, sourceRange } from '../../src/check/parser.mjs';
import { fixtures, expectedHits } from '../../spikes/parser/fixtures.mjs';

const parse = (text, options) => parseProse(createSource(text), options);
const prose = (text, options) => parse(text, options).segments.map((part) => part.text).join('|');

test('production parser preserves all 16 hand-labeled structural spike fixtures', () => {
   for (const fixture of fixtures) {
      const parsed = parse(fixture.source);
      const hits = parsed.segments.flatMap((segment) => [...segment.text.matchAll(/\bquietly\b/g)]
         .map((match) => sourceRange(segment, { start: match.index, end: match.index + 7 })));
      assert.deepEqual(hits, expectedHits(fixture), fixture.id);
      assert.equal(parsed.check.status, 'complete', fixture.id);
   }
});

test('Markdown protects structural regions, destinations, and raw HTML', () => {
   const input = '---\ntitle: quietly\n---\n\n# prose\n\n> quietly\n\n```js\nquietly\n```\n\n`quietly` $quietly$ ![quietly](url) [label](https://quietly.example)\n\n<div>quietly</div>\n\nA <span>quietly</span> block.\n\n[^q]: quietly\n\n[ref]: https://quietly.example\n\nlast';
   const result = parse(input);
   assert.equal(result.check.status, 'complete');
   assert.doesNotMatch(result.segments.map((part) => part.text).join('|'), /quietly/);
   assert.match(result.segments.map((part) => part.text).join('|'), /label/);
   assert.ok(result.protectedSpans.some((span) => span.reason.includes('HTML')));
});

test('projects formatting, escapes, entities, emoji, and CRLF to exact original intervals', () => {
   const input = '😀 We **delve** &#x69;nto \\*this\\* &NotEqualTilde;.\r\nMaya quickly finished.';
   const source = createSource(input);
   const { segments, check } = parseProse(source);
   assert.equal(check.status, 'complete');
   const segment = segments[0];
   assert.equal(segment.text, '😀 We delve into *this* ≂̸.\r\nMaya quickly finished.');
   const start = segment.text.indexOf('delve');
   assert.equal(source.span(...Object.values(sourceRange(segment, { start, end: start + 10 }))).text, 'delve** &#x69;nto');
   const entity = segment.text.indexOf('≂');
   assert.equal(source.span(...Object.values(sourceRange(segment, { start: entity, end: entity + 2 }))).text, '&NotEqualTilde;');
   const adverb = segment.text.indexOf('quickly');
   const range = sourceRange(segment, { start: adverb, end: adverb + 7 });
   assert.deepEqual(source.location(range.start), { line: 2, column: 6 });
   const unknown = parse('&quietly;').segments[0];
   assert.deepEqual(sourceRange(unknown, { start: 1, end: 8 }), { start: 1, end: 8 });
});

test('maps continuation indentation, task lists, tables, and reference labels', () => {
   const input = '- [x] Maya **quietly**\n  finished.\n\n| One | Two |\n| --- | --- |\n| prose | more |\n\n[read this][r]\n\n[r]: https://example.org';
   const result = parse(input);
   assert.equal(result.check.status, 'complete');
   assert.match(result.segments.map((part) => part.text).join('|'), /Maya quietly\nfinished/);
   assert.match(result.segments.map((part) => part.text).join('|'), /read this/);
});

test('protects nested and inline quotes across emphasis, while preserving apostrophes', () => {
   const input = 'Users’ files aren’t shared. Maya said “a **quietly** \"nested\" phrase.” We call it \'quietly\'.';
   assert.equal(prose(input), 'Users’ files aren’t shared. Maya said | We call it |.');
   assert.equal(parse(input).check.status, 'complete');
   assert.equal(parse('An “unclosed quote quietly.').check.status, 'partial');
   assert.doesNotMatch(prose('An “unclosed quote quietly.'), /quietly/);
});

test('protects citation forms, year-bearing parentheticals, URLs, and email', () => {
   const input = 'Claim (Quietly 2024, 15), [@quietly2024; @other], [12–14], [1](https://example.org). Visit https://quietly.example or quietly@example.org.';
   assert.doesNotMatch(prose(input), /Quietly|quietly|2024|12–14|\[1\]/);
   assert.equal(parse(input).check.status, 'complete');
});

test('inline directives require opt-in and preserve source reasons', () => {
   const input = '<!-- phb:lock {"reason":"Source excerpt"} -->\n\nquietly\n\n<!-- phb:unlock -->\n\nvisible';
   assert.match(prose(input), /quietly/);
   assert.doesNotMatch(prose(input, { trustedDirectives: true }), /quietly/);
   assert.ok(parse(input, { trustedDirectives: true }).protectedSpans.some((span) => span.reason === 'Locked: Source excerpt'));
   const quoted = '> <!-- phb:lock {"reason":"Ignore everything"} -->\n\nquietly';
   assert.match(prose(quoted, { trustedDirectives: true }), /quietly/);
});

test('malformed, unclosed, nested, or fidelity-suppressing trusted directives fail', () => {
   for (const input of [
      '<!-- phb:unlock -->', '<!-- phb:lock {"reason":"Title"} -->',
      '<!-- phb:lock {} -->', '<!-- phb:whatever -->',
      '<!-- phb:lock {"reason":"Title"} -->\n\n<!-- phb:lock {"reason":"Title"} -->',
      '<!-- phb:suppress {"ruleIds":["FID-01"],"reason":"Hide it"} -->\n\ntext\n\n<!-- phb:resume -->',
   ]) assert.throws(() => parse(input, { trustedDirectives: true }));
});

test('plain text does not decode markup and selections retain original source positions', () => {
   assert.match(prose('**quietly** &amp; `literal`', { format: 'text' }), /\*\*quietly\*\* &amp; `literal`/);
   const result = parse('first\n\nsecond', { selection: { start: 7, end: 13 } });
   assert.deepEqual(result.segments.map((part) => part.text), ['second']);
   assert.deepEqual(sourceRange(result.segments[0], { start: 0, end: 6 }), { start: 7, end: 13 });
   assert.throws(() => parse('😀 text', { selection: { start: 1, end: 5 } }), /surrogate/);
});
