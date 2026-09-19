import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProse } from '../../src/check/check.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { grammarFixtures } from '../../spikes/parser/fixtures.mjs';

const check = (text, settings = {}, options = {}) => checkProse(text,
   resolveConfig({ project: { version: 1, ...settings } }).config, options).report;
const hits = (text, ruleId, settings = {}, options = {}) => check(text, settings, options).findings.filter((item) => item.ruleId === ruleId);

test('local candidates cover all 20 labeled grammar spike examples without upgrading evidence', () => {
   for (const fixture of grammarFixtures) {
      const report = check(fixture.text);
      assert.deepEqual(report.findings.filter((item) => item.ruleId === 'GRAM-01').map((item) => item.span.text), fixture.adverbs, fixture.text);
      assert.equal(report.findings.some((item) => item.ruleId === 'CLR-01'), fixture.passive, fixture.text);
      assert.ok(report.findings.every((item) => item.status === 'candidate'));
   }
});

test('exact phrase bans span formatting and decoded characters with raw source evidence', () => {
   const result = check('We **delve** &#x69;nto it.');
   const finding = result.findings.find((item) => item.ruleId === 'LEX-01');
   assert.equal(finding.span.text, 'delve** &#x69;nto');
   assert.equal(finding.status, 'confirmed');
   assert.equal(result.exitCode, 1);
   assert.equal(finding.fix, undefined);
});

test('phrases never bridge code, quotes, citations, or paragraphs', () => {
   const result = hits('delve `code` into\n\ndelve “quote” into\n\ndelve (Jones 2024) into\n\ndelve\n\ninto', 'LEX-01');
   assert.deepEqual(result, []);
   assert.deepEqual(hits('“delve into” > `delve into`', 'LEX-01'), []);
});

test('terminology, allowlists, matching policy, and configured suppressions apply', () => {
   assert.equal(hits('robust regression and robust estimates', 'LEX-01', { forbiddenPhrases: ['robust'] })[0].status, 'suppressed');
   assert.equal(hits('Old\tName', 'LEX-01', { requiredTerminology: [{ preferred: 'New Name', avoid: ['old name'] }] }).length, 1);
   assert.equal(hits('Old\tName', 'LEX-01', { matching: { whitespace: 'literal' }, requiredTerminology: [{ preferred: 'New Name', avoid: ['old name'] }] }).length, 0);
   const result = check('We delve into it.', { suppressions: [{ ruleIds: ['LEX-01'], reason: 'Documented title', paths: ['docs/**'] }] }, { path: 'docs/a.md' });
   assert.equal(result.findings[0].exemption.kind, 'configuration');
   assert.equal(result.exitCode, 0);
   const projected = hits('r&#111;bust **regression**', 'LEX-01', { forbiddenPhrases: ['robust'] });
   assert.equal(projected[0].status, 'suppressed');
   assert.equal(projected[0].exemption.kind, 'allowlist');
});

test('trusted inline suppressions remain visible and scoped', () => {
   const input = '<!-- phb:suppress {"ruleIds":["LEX-01"],"reason":"Exact title"} -->\n\nWe delve into it.\n\n<!-- phb:resume -->\n\nWe delve into it.';
   const findings = hits(input, 'LEX-01', {}, { trustedDirectives: true });
   assert.deepEqual(findings.map((item) => item.status), ['suppressed', 'confirmed']);
   assert.equal(findings[0].exemption.reason, 'Exact title');
   assert.deepEqual(hits(input, 'LEX-01').map((item) => item.status), ['confirmed', 'confirmed']);
});

for (const [name, input, expected] of [
   ['ordinary and flat adverbs', 'Maya quietly finished. She worked hard and arrived late.', ['quietly', 'hard', 'late']],
   ['negation', 'Maya never waits. Do not delete it. We don’t agree.', ['never', 'not', 'don’t']],
   ['adjective lookalikes', 'A friendly reviewer sent a lovely daily report.', []],
]) test(`adverb candidates: ${name}`, () => {
   assert.deepEqual(hits(input, 'GRAM-01').map((item) => item.span.text), expected);
});

for (const input of ['The report was approved by Maya.', 'The report has been approved.',
   'The report got approved.', 'The report needs to be reviewed.', 'The report, approved by Maya, reached the board.']) {
   test(`passive candidate: ${input}`, () => assert.ok(hits(input, 'CLR-01').length));
}

test('copulas and active perfect verbs do not trigger passive candidates', () => {
   assert.equal(hits('Maya is ready. Maya has approved the report.', 'CLR-01').length, 0);
});

for (const input of ['This is not a feature. It is a revolution.', 'It’s not about speed. It’s about trust.',
   'This is a tool, not a revolution.', 'Not just faster but better.']) {
   test(`contrast candidate: ${input}`, () => assert.ok(hits(input, 'STR-01').length));
}

test('missing-owner duties are candidates; named actors and imperatives stay intact', () => {
   for (const input of ['Approval is required before launch.', 'The report must be reviewed.',
      'It is essential to review the report.', 'There is a need to review the report.']) assert.ok(hits(input, 'CLR-05').length);
   for (const input of ['Maya must review the report.', 'Review the report before launch.',
      'The report must be reviewed by Maya.']) assert.equal(hits(input, 'CLR-05').length, 0);
});

test('all four house bans remain heuristic warnings until contextual review', () => {
   const report = check('Maya quickly finished. The report must be reviewed. This is a tool, not a toy.');
   assert.deepEqual(new Set(report.findings.map((item) => item.ruleId)), new Set(['GRAM-01', 'CLR-01', 'CLR-05', 'STR-01']));
   for (const item of report.findings) {
      assert.equal(item.status, 'candidate');
      assert.equal(item.severity, 'warning');
      assert.equal(item.ruleSeverity, 'error');
      assert.equal(item.evidence, 'heuristic');
      assert.equal(item.fix, undefined);
   }
   assert.equal(report.exitCode, 0);
   assert.equal(report.coverage, 'partial');
});

test('required incomplete checks, malformed boundaries, and disabled rules have honest exits', () => {
   assert.equal(check('Maya finished.', {}, { requestedChecks: ['GRAM-01'] }).exitCode, 2);
   assert.equal(check('Maya finished.', {}, { requestedChecks: ['UNI-01'] }).exitCode, 2);
   assert.equal(check('Maya said “an unclosed quotation.').exitCode, 2);
   assert.equal(check('We delve into it.', { rules: { 'LEX-01': 'off' } }).exitCode, 0);
   assert.throws(() => check('text', { rules: { 'LEX-01': 'off' } }, { requestedChecks: ['LEX-01'] }), /disabled/);
});

test('a selection does not create a word boundary or lose an enclosing allowlist', () => {
   assert.deepEqual(hits('robust', 'LEX-01', { forbiddenPhrases: ['bust'] }, { selection: { start: 2, end: 6 } }), []);
   const result = hits('robust regression', 'LEX-01', { forbiddenPhrases: ['robust'] }, { selection: { start: 0, end: 6 } });
   assert.equal(result[0].status, 'suppressed');
});
