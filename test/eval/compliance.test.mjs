import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPrompt, parseResponse, scoreCase } from '../../eval/compliance/protocol.mjs';
const corpus = JSON.parse(readFileSync(new URL('../../eval/compliance/cases.json', import.meta.url), 'utf8'));
const item = id => corpus.cases.find(item => item.id === id);
const output = (id, text, status = 'clean', issues = []) => ({ id, text, status, issues });

test('prompts hide annotations and preserve untrusted source as data', () => {
   const prompt = buildPrompt('Test policy.', [item('passive-unknown')]);
   assert.ok(prompt.includes(item('passive-unknown').source));
   for (const key of ['expectedStatus', 'expectedIssue', 'mustContain', 'review']) assert.ok(!prompt.includes(`"${key}"`));
});
test('output protocol rejects missing, duplicate, invented IDs and status contradictions', () => {
   const cases = [item('clean-control'), item('passive-known')];
   const good = cases.map(item => output(item.id, item.source));
   assert.doesNotThrow(() => parseResponse({ results: good }, cases));
   for (const results of [good.slice(0, 1), [good[0], good[0]], [good[0], { ...good[1], id: 'fake' }], [{ ...good[0], status: 'needs-review' }, good[1]]]) assert.throws(() => parseResponse({ results }, cases));
   assert.throws(() => parseResponse({ results: [{ ...good[0], unexpected: true }, good[1]] }, cases));
});
test('protected Unicode removal and quote mutation fail exact preservation', () => {
   const fixture = item('unicode-preserve');
   assert.equal(scoreCase(fixture, output(fixture.id, fixture.source)).mechanicalPass, true);
   for (const text of [fixture.source.replaceAll('\u200d', ''), fixture.source.replaceAll('\u00a0', ' '), fixture.source.replace('café', 'cafe')]) {
      assert.ok(scoreCase(fixture, output(fixture.id, text)).flags.some(flag => flag.kind === 'protected-bytes'));
   }
});
test('loss of modality or known restriction triggers invariant review', () => {
   const fixture = item('modality-negation');
   assert.ok(scoreCase(fixture, output(fixture.id, fixture.source.replace('may ', ''))).flags.some(flag => flag.kind === 'lexical-invariant'));
   const restriction = item('contrast-restriction');
   assert.ok(scoreCase(restriction, output(restriction.id, 'Use staging credentials in tests.')).flags.some(flag => flag.kind === 'lexical-invariant'));
});
test('a missing-actor clean claim fails while an explicit unresolved finding passes', () => {
   const fixture = item('passive-unknown');
   assert.equal(scoreCase(fixture, output(fixture.id, fixture.source)).mechanicalPass, false);
   const scored = scoreCase(fixture, output(fixture.id, fixture.source, 'needs-review', [{ rule: 'CLR-01', reason: 'The source gives no actor.' }]));
   assert.equal(scored.mechanicalPass, true);
   assert.ok(scored.candidates.some(candidate => candidate.rule === 'CLR-01'));
});
test('rewriting the clean control and duplicating protected spans are detected', () => {
   const fixture = item('clean-control');
   assert.equal(scoreCase(fixture, output(fixture.id, fixture.source)).mechanicalPass, true);
   assert.ok(scoreCase(fixture, output(fixture.id, fixture.source + ' Done.')).flags.some(flag => flag.kind === 'unnecessary-rewrite'));
   const protectedItem = item('protected-markdown');
   assert.ok(scoreCase(protectedItem, output(protectedItem.id, protectedItem.source + protectedItem.protected[0])).flags.some(flag => flag.kind === 'protected-count'));
});
test('short samples cannot pass the reading-grade gate', () => {
   const scored = scoreCase(item('readability'), output('readability', 'Maya plants seeds.'));
   assert.equal(scored.readability.grade, null);
   assert.ok(scored.flags.some(flag => flag.kind === 'reading-grade'));
});
