import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProse } from '../../src/check/check.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { houseBanIds } from '../../src/contracts/catalog.mjs';

const check = (text, settings = {}, options = {}) => checkProse(text,
   resolveConfig({ project: { version: 1, ...settings } }).config, options);
const hits = (text, id, settings, options) => check(text, settings, options).report.findings.filter((item) => item.ruleId === id);

for (const [id, flagged, clear] of [
   ['CMO-01', 'The plan — a useful one — will work.', 'The plan—a useful one—will work.'],
   ['CMO-02', 'The plan has a flaw: it will fail.', 'The plan has a flaw: It will fail.'],
   ['CMO-03', 'Read the e-book.', 'Read the ebook.'],
   ['CMO-04', 'We meet on September 19th.', 'We meet on September 19.'],
   ['CMO-05', 'Use a tool (e.g. a saw).', 'Use a tool (e.g., a saw).'],
   ['CMO-06', 'She called it “fine”.', 'She called it “fine.”'],
]) test(`${id} produces review candidates with source references and no fixes`, () => {
   const findings = hits(flagged, id);
   assert.ok(findings.length);
   for (const finding of findings) {
      assert.equal(finding.status, 'candidate');
      assert.equal(finding.evidence, 'heuristic');
      assert.equal(finding.fix, undefined);
      assert.match(finding.reason, /Source edition: (17|18); https:\/\/www.chicagomanualofstyle.org/);
   }
   assert.equal(hits(clear, id).length, 0);
   assert.equal(check(clear, {}, { requestedChecks: [id] }).report.exitCode, 2);
});

test('colon capitalization screens a declared subset and leaves fragments and headings alone', () => {
   for (const text of ['Tools: a saw and a drill.', 'The labels: is, are, and was.', '# Note: it will fail.']) assert.deepEqual(hits(text, 'CMO-02'), []);
   assert.equal(hits('A warning: they must stop.', 'CMO-02').length, 1);
});

test('month-first detector preserves ordinal-before-month and standalone uses', () => {
   for (const text of ['We meet on the 19th of September.', 'We meet on the 19th.', 'The value is May 999th.', 'March 1 is the date.']) assert.deepEqual(hits(text, 'CMO-04'), []);
});

test('spelling boundaries, decoded entities, and case retain raw source evidence', () => {
   assert.deepEqual(hits('Thee-books are an identifier.', 'CMO-03'), []);
   const finding = hits('An **E&#45;Book** is ready.', 'CMO-03')[0];
   assert.equal(finding.span.text, 'E&#45;Book');
   assert.equal(finding.ruleVersion, '1.1.0');
});

test('protected markup, exact quotations, and citation facts remain outside style candidates', () => {
   const examples = ['`e-book`', '“e-book”', '> e-book', '---\ntitle: e-book\n---', '<span>e-book</span>', '[source](https://example.com/e-book)', '$e-book$', '(E-book 2024)'];
   for (const text of examples) assert.deepEqual(hits(text, 'CMO-03'), [], text);
   const text = 'She said “fine”, citing (Jones 2024, 19).';
   const result = check(text);
   const finding = result.report.findings.find((item) => item.ruleId === 'CMO-06');
   assert.equal(finding.span.text, ',');
   assert.equal(finding.span.start, text.indexOf(','));
   assert.ok(result.boundaries.protectedSpans.some((span) => text.slice(span.start, span.end) === '(Jones 2024, 19)'));
});

test('quotation-punctuation candidates respect nested quotes, locks, selection, and other punctuation', () => {
   assert.deepEqual(hits('She said “fine”; we left.', 'CMO-06'), []);
   assert.deepEqual(hits('She said “fine”?', 'CMO-06'), []);
   const text = 'She called it “fine”.';
   assert.deepEqual(hits(text, 'CMO-06', {}, { selection: { start: 0, end: text.length - 1 } }), []);
   assert.equal(hits(text, 'CMO-06', {}, { selection: { start: text.length - 1, end: text.length } }).length, 1);
   const locked = '<!-- phb:lock {"reason":"Exact copy"} -->\n\n' + text + '\n\n<!-- phb:unlock -->';
   assert.deepEqual(hits(locked, 'CMO-06', {}, { trustedDirectives: true }), []);
   assert.equal(hits('She called it “a ‘fine’ day”.', 'CMO-06').length, 1);
});

test('all family coverage remains partial, with edition and scope visible even on clean input', () => {
   const result = check('The cat sat on the mat.');
   assert.equal(result.chicago.targetEdition, 18);
   assert.equal(result.chicago.rules.length, 6);
   assert.deepEqual(result.chicago.rules.map((rule) => rule.sourceEdition), [17, 18, 18, 18, 17, 18]);
   assert.ok(result.report.checks.filter((item) => item.id.startsWith('CMO-')).every((item) => item.status === 'partial'));
   assert.throws(() => { result.chicago.rules[0].sourceEdition = 18; }, TypeError);
});

test('configuration and trusted suppressions override style candidates while house bans stay enabled', () => {
   assert.deepEqual(hits('An e-book.', 'CMO-03', { rules: { 'CMO-03': 'off' } }), []);
   const disabled = check('An e-book.', { rules: { 'CMO-03': 'off' } });
   assert.equal(disabled.chicago.rules.find((rule) => rule.ruleId === 'CMO-03').status, 'disabled');
   const settings = { suppressions: [{ ruleIds: ['CMO-03'], reason: 'Exact brand' }] };
   assert.equal(hits('An e-book.', 'CMO-03', settings)[0].status, 'suppressed');
   const inline = '<!-- phb:suppress {"ruleIds":["CMO-03"],"reason":"Brand"} -->\n\nAn e-book.\n\n<!-- phb:resume -->';
   assert.equal(hits(inline, 'CMO-03', {}, { trustedDirectives: true })[0].status, 'suppressed');
   for (const id of houseBanIds) assert.equal(resolveConfig({ project: { version: 1, ...settings } }).config.rules[id], 'error');
});
