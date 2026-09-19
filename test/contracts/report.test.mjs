import test from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../../src/contracts/source.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';
import { createFinding, validateFinding, buildReport } from '../../src/contracts/report.mjs';
import { ruleIds } from '../../src/contracts/catalog.mjs';
import { validate, ContractError } from '../../src/contracts/validate.mjs';

const source = createSource('We delve into the report.');
const { config } = resolveConfig();
const range = { start: 3, end: 13 };
const findingInput = { source, config, ruleId: 'LEX-01', range, reason: 'Configured phrase ban.' };
const local = { source, config, requestedChecks: ['LEX-01'], checks: [{ id: 'boundaries', status: 'complete' }, { id: 'LEX-01', status: 'complete' }] };
const allChecks = ['boundaries', ...ruleIds].map((id) => ({ id, status: 'complete' }));

test('finding includes original positions, hash, rule version, and evidence', () => {
   const finding = createFinding(findingInput);
   validate('finding', finding);
   assert.equal(finding.inputHash, source.hash);
   assert.equal(finding.ruleVersion, '1.0.0');
   assert.equal(finding.evidence, 'exact');
   assert.equal(finding.span.text, 'delve into');
   assert.deepEqual(finding.span.startLocation, { line: 1, column: 4 });
   assert.equal(finding.status, 'confirmed');
   assert.throws(() => { finding.span.start = 0; }, TypeError);
   assert.throws(() => createFinding({ ...findingInput, reason: undefined, protectedSpans: [range] }), /state a reason/);
});

test('grammar candidates carry the strict rule level without claiming confirmed errors', () => {
   const grammarSource = createSource('The report was approved.');
   const input = { source: grammarSource, config, ruleId: 'CLR-01', range: { start: 11, end: 23 }, reason: 'Passive candidate.' };
   const candidate = createFinding(input);
   assert.equal(candidate.status, 'candidate');
   assert.equal(candidate.ruleSeverity, 'error');
   assert.equal(candidate.severity, 'warning');
   assert.throws(() => createFinding({ ...input, status: 'confirmed' }), /semantic confirmation/);
   assert.throws(() => createFinding({ ...input, fix: { replacement: 'Maya approved', policy: 'editorial-review' } }), /cannot carry a fix/);
   assert.equal(createFinding({ ...input, status: 'confirmed', evidence: 'semantic' }).severity, 'error');
});

test('protected matches become conflicts and proposed fixes cannot touch locked spans', () => {
   const protectedSpans = [{ ...range, reason: 'Exact quotation' }];
   const conflict = createFinding({ ...findingInput, protectedSpans });
   assert.equal(conflict.status, 'conflict');
   assert.match(conflict.reason, /Exact quotation/);
   assert.throws(() => createFinding({ ...findingInput, protectedSpans, fix: { replacement: 'review', policy: 'editorial-review' } }), /cannot carry a fix/);
   assert.throws(() => createFinding({ ...findingInput, protectedSpans: [{ start: 0, end: 2 }], fix: { range: { start: 0, end: 13 }, replacement: 'We review', policy: 'editorial-review' } }), /protected source/);
});

test('fixes require exact preconditions and do not gain automatic authorization from exact matching', () => {
   const finding = createFinding({ ...findingInput, fix: { replacement: 'review', policy: 'editorial-review' } });
   assert.deepEqual(finding.fix, { inputHash: source.hash, range, original: 'delve into', replacement: 'review', policy: 'editorial-review' });
   assert.throws(() => createFinding({ ...findingInput, fix: { replacement: 'review', policy: 'safe-local' } }), /Fix policy/);
   assert.throws(() => createFinding({ ...findingInput, fix: { range: { start: 3, end: 8 }, replacement: '', policy: 'editorial-review' } }), /include the finding/);
   const stale = structuredClone(finding);
   stale.fix.original = 'wrong';
   assert.throws(() => validateFinding(source, config, stale), /original source/);
});

test('serialized findings cannot forge source offsets, evidence, versions, or exemptions', () => {
   const finding = createFinding(findingInput);
   for (const mutate of [
      (item) => { item.inputHash = '0'.repeat(64); },
      (item) => { item.span.startLocation.column = 9; },
      (item) => { item.span.text = 'wrong'; },
      (item) => { item.ruleVersion = '9.0.0'; },
      (item) => { item.evidence = 'heuristic'; },
   ]) {
      const copy = structuredClone(finding);
      mutate(copy);
      assert.throws(() => validateFinding(source, config, copy), ContractError);
   }
   assert.throws(() => validateFinding(source, config, { ...finding, status: 'suppressed', exemption: { kind: 'configuration', reason: 'Made up' } }), /not supported/);
});

test('documented exemptions remain visible and are checked against trusted suppression spans', () => {
   const inlineSuppressions = [{ version: 1, ruleIds: ['LEX-01'], range, reason: 'Literal example' }];
   const finding = createFinding({ ...findingInput, inlineSuppressions, protectedSpans: [range] });
   assert.equal(finding.status, 'suppressed');
   assert.equal(finding.exemption.reason, 'Literal example');
   assert.equal(buildReport({ ...local, findings: [finding], inlineSuppressions, protectedSpans: [range] }).exitCode, 0);
   assert.throws(() => buildReport({ ...local, findings: [finding] }), /not supported/);
   assert.throws(() => createFinding({ ...findingInput, status: 'suppressed' }), /documented exemption/);
});

test('a requested local scan may pass while omitted semantic checks remain visible', () => {
   const report = buildReport(local);
   assert.equal(report.exitCode, 0);
   assert.equal(report.requestedCoverage, 'complete');
   assert.equal(report.coverage, 'partial');
   assert.equal(report.checks.find((item) => item.id === 'CLR-05').status, 'skipped');
   assert.match(report.checks.find((item) => item.id === 'CLR-05').reason, /No check/);
});

test('confirmed findings and protected conflicts use threshold exit code 1', () => {
   assert.equal(buildReport({ ...local, findings: [createFinding(findingInput)] }).exitCode, 1);
   const conflict = createFinding({ ...findingInput, protectedSpans: [range] });
   assert.equal(buildReport({ ...local, findings: [conflict], protectedSpans: [range] }).exitCode, 1);
   const warningConfig = resolveConfig({ invocation: { version: 1, rules: { 'LEX-01': 'warning' } } }).config;
   const warning = createFinding({ ...findingInput, config: warningConfig });
   assert.equal(buildReport({ ...local, config: warningConfig, findings: [warning] }).exitCode, 0);
   assert.equal(buildReport({ ...local, config: warningConfig, findings: [warning], threshold: 'warning' }).exitCode, 1);
});

test('missing boundaries, partial required checks, and operational failures return 2', () => {
   assert.equal(buildReport({ ...local, checks: [{ id: 'LEX-01', status: 'complete' }] }).exitCode, 2);
   assert.equal(buildReport({ ...local, checks: [{ id: 'boundaries', status: 'partial', reason: 'Citation boundaries unresolved.' }, { id: 'LEX-01', status: 'complete' }] }).exitCode, 2);
   const failed = buildReport({ ...local, checks: [...local.checks, { id: 'UNI-01', status: 'failed', reason: 'Inventory error.' }] });
   assert.equal(failed.coverage, 'failed');
   assert.equal(failed.exitCode, 2);
});

test('editorial scope includes every enabled rule and rejects hidden candidates', () => {
   const candidate = createFinding({ ...findingInput, ruleId: 'STR-01', reason: 'Contrast candidate.' });
   const report = buildReport({ source, config, scope: 'editorial', checks: allChecks, findings: [candidate] });
   assert.equal(report.checks.find((item) => item.id === 'STR-01').status, 'partial');
   assert.equal(report.exitCode, 2);
   assert.throws(() => buildReport({ ...local, scope: 'editorial' }), /every enabled rule/);
   assert.equal(buildReport({ source, config, scope: 'editorial', checks: allChecks }).coverage, 'complete');
});

test('local scope cannot claim semantic completion or accept contextual findings', () => {
   assert.throws(() => buildReport({ ...local, checks: [...local.checks, { id: 'CLR-05', status: 'complete' }] }), /contextual rule/);
   const finding = createFinding({ ...findingInput, ruleId: 'STR-01', evidence: 'semantic', status: 'confirmed' });
   assert.throws(() => buildReport({ ...local, findings: [finding] }), /semantic-review/);
});

test('coverage rejects unknown, duplicate, disabled, or unexplained checks', () => {
   assert.throws(() => buildReport({ ...local, checks: [...local.checks, local.checks[0]] }), /Duplicate/);
   assert.throws(() => buildReport({ ...local, requestedChecks: ['UNKNOWN-01'] }), /unknown or disabled/);
   assert.throws(() => buildReport({ ...local, checks: [{ id: 'LEX-01', status: 'skipped' }] }), /state a reason/);
   assert.throws(() => buildReport({ ...local, checks: [{ id: 'LEX-01', status: 'complete', confidence: 1 }] }), /Unknown check-result/);
   assert.throws(() => buildReport({ ...local, findings: [createFinding(findingInput)], checks: [] }), /executed check/);
   const disabled = resolveConfig({ project: { version: 1, rules: { 'LEX-01': 'off' } } }).config;
   assert.throws(() => buildReport({ ...local, config: disabled }), /unknown or disabled/);
});
