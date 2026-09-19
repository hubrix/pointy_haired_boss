import { isDeepStrictEqual } from 'node:util';
import { ruleById, ruleIds, deepFreeze } from './catalog.mjs';
import { ContractError, validate } from './validate.mjs';
import { resolveExemption, overlaps } from './phrases.mjs';

const levels = { suggestion: 1, warning: 2, error: 3 };
const defaultLocalChecks = ['LEX-01', ...ruleIds.filter((id) => id.startsWith('UNI-'))];
const displaySeverity = (severity, status) => status === 'candidate' && severity === 'error' ? 'warning' : severity;

export function validateFinding(source, config, finding, { protectedSpans = [], path, inlineSuppressions = [], allowlistMatches = [] } = {}) {
   validate('finding', finding);
   const rule = ruleById[finding.ruleId];
   if (finding.ruleVersion !== rule.version) throw new ContractError('Finding rule version does not match the catalog');
   if (finding.inputHash !== source.hash || !isDeepStrictEqual(finding.span, source.span(finding.span.start, finding.span.end))) throw new ContractError('Finding does not match the original source');
   if (finding.span.end <= finding.span.start) throw new ContractError('Finding must cover a nonempty source range');
   const ruleSeverity = config.rules[finding.ruleId];
   if (ruleSeverity === 'off' || finding.ruleSeverity !== ruleSeverity || finding.severity !== displaySeverity(ruleSeverity, finding.status)) throw new ContractError('Finding severity does not match effective configuration');
   if (finding.status === 'confirmed' && rule.detector.requiresContext && finding.evidence !== 'semantic') throw new ContractError('Contextual rule needs semantic confirmation');
   if (finding.status === 'confirmed' && rule.detector.type === 'exact' && finding.evidence === 'heuristic') throw new ContractError('A heuristic cannot confirm an exact rule');
   if ((finding.status === 'suppressed') !== Boolean(finding.exemption)) throw new ContractError('Only a suppressed finding carries an exemption, with a reason');
   if (finding.ruleId.startsWith('FID-') && finding.status === 'suppressed') throw new ContractError('Fidelity findings cannot be suppressed');
   for (const range of protectedSpans) source.span(range.start, range.end);
   if (finding.status === 'suppressed') {
      const expected = resolveExemption({ source, config, ruleId: finding.ruleId, range: finding.span, path, inlineSuppressions, protectedSpans, allowlistMatches });
      if (!isDeepStrictEqual(finding.exemption, expected)) throw new ContractError('Finding exemption is not supported by the effective policy');
   }
   if (finding.fix) {
      if (finding.status !== 'confirmed') throw new ContractError('Unresolved or suppressed findings cannot carry a fix');
      if (rule.fixPolicy === 'report-only' || (finding.fix.policy === 'safe-local' && rule.fixPolicy !== 'safe-local')) throw new ContractError('Fix policy is not allowed for this rule');
      const fix = finding.fix;
      const original = source.span(fix.range.start, fix.range.end);
      if (fix.range.end <= fix.range.start || fix.inputHash !== source.hash || fix.original !== original.text) throw new ContractError('Fix does not match the original source');
      if (fix.range.start > finding.span.start || fix.range.end < finding.span.end) throw new ContractError('Fix must include the finding it addresses');
      if (!fix.replacement.isWellFormed()) throw new ContractError('Replacement contains an unpaired surrogate');
      if (protectedSpans.some((range) => overlaps(range, fix.range))) throw new ContractError('Fix intersects protected source content');
   }
   return finding;
}

export function createFinding({ source, config, ruleId, range, reason, evidence, status, fix, path, inlineSuppressions = [], protectedSpans = [], allowlistMatches = [] }) {
   if (!Object.hasOwn(ruleById, ruleId)) throw new ContractError(`Unknown rule: ${ruleId}`);
   if (typeof reason !== 'string' || !reason.trim()) throw new ContractError('Finding must state a reason');
   const rule = ruleById[ruleId];
   const ruleSeverity = config.rules[ruleId];
   if (ruleSeverity === 'off') throw new ContractError(`Cannot report disabled rule: ${ruleId}`);
   let findingStatus = status ?? (rule.detector.requiresContext ? 'candidate' : 'confirmed');
   if (findingStatus === 'suppressed') throw new ContractError('Suppression must come from a documented exemption');
   const exemption = resolveExemption({ source, config, ruleId, range, path, inlineSuppressions, protectedSpans, allowlistMatches });
   if (exemption?.kind === 'protected') {
      findingStatus = 'conflict';
      reason = `${reason} ${exemption.reason}`;
   } else if (exemption) findingStatus = 'suppressed';
   const finding = {
      version: 1, ruleId, ruleVersion: rule.version, inputHash: source.hash,
      ruleSeverity, severity: displaySeverity(ruleSeverity, findingStatus), status: findingStatus,
      evidence: evidence ?? rule.detector.type, reason, span: source.span(range.start, range.end),
   };
   if (exemption && exemption.kind !== 'protected') finding.exemption = exemption;
   if (fix) {
      const fixRange = fix.range ?? range;
      finding.fix = { inputHash: source.hash, range: { start: fixRange.start, end: fixRange.end }, original: source.span(fixRange.start, fixRange.end).text, replacement: fix.replacement, policy: fix.policy };
   }
   return deepFreeze(validateFinding(source, config, finding, { protectedSpans, path, inlineSuppressions, allowlistMatches }));
}

function coverage(checks) {
   if (checks.some((item) => item.status === 'failed')) return 'failed';
   return checks.every((item) => item.status === 'complete') ? 'complete' : 'partial';
}

export function buildReport({ source, config, scope = 'local', requestedChecks, checks = [], findings = [], threshold = 'error', protectedSpans = [], path, inlineSuppressions = [], allowlistMatches = [] }) {
   if (!['local', 'editorial'].includes(scope)) throw new ContractError(`Unknown report scope: ${scope}`);
   if (!Object.hasOwn(levels, threshold)) throw new ContractError(`Unknown threshold: ${threshold}`);
   const enabled = ruleIds.filter((id) => config.rules[id] !== 'off');
   if (scope === 'editorial' && requestedChecks !== undefined) throw new ContractError('Editorial scope requires every enabled rule');
   const requested = new Set(['boundaries', ...(requestedChecks ?? (scope === 'editorial' ? enabled : defaultLocalChecks.filter((id) => enabled.includes(id))))]);
   for (const id of requested) {
      if (id !== 'boundaries' && !enabled.includes(id)) throw new ContractError(`Requested check is unknown or disabled: ${id}`);
   }
   const supplied = new Map();
   for (const check of checks) {
      if (Object.keys(check).some((key) => !['id', 'status', 'reason'].includes(key))) throw new ContractError('Unknown check-result field');
      if (check.id !== 'boundaries' && !enabled.includes(check.id)) throw new ContractError(`Check result is unknown or disabled: ${check.id}`);
      if (supplied.has(check.id)) throw new ContractError(`Duplicate check result: ${check.id}`);
      if (!['complete', 'partial', 'skipped', 'failed'].includes(check.status)) throw new ContractError('Unknown check status');
      if (scope === 'local' && check.status === 'complete' && ruleById[check.id]?.detector.requiresContext) throw new ContractError('A local run cannot complete a contextual rule');
      if (check.status !== 'complete' && (typeof check.reason !== 'string' || !check.reason.trim())) throw new ContractError('Incomplete checks must state a reason');
      supplied.set(check.id, check);
   }
   for (const finding of findings) {
      validateFinding(source, config, finding, { protectedSpans, path, inlineSuppressions, allowlistMatches });
      if (scope === 'local' && finding.evidence === 'semantic') throw new ContractError('Local scope cannot contain semantic-review findings');
      if (!supplied.has(finding.ruleId) || supplied.get(finding.ruleId).status === 'skipped') throw new ContractError('Finding needs a corresponding executed check');
   }
   const completed = ['boundaries', ...ruleIds].map((id) => {
      const active = id === 'boundaries' || enabled.includes(id);
      const raw = supplied.get(id) ?? { status: 'skipped', reason: active ? 'No check result supplied.' : 'Disabled by configuration.' };
      const check = { id, required: requested.has(id), status: raw.status, ...(raw.reason === undefined ? {} : { reason: raw.reason }) };
      if (check.status === 'complete' && findings.some((finding) => finding.ruleId === id && finding.status === 'candidate')) {
         check.status = 'partial';
         check.reason = 'Contextual candidates remain unresolved.';
      }
      return check;
   });
   const overall = coverage(completed.filter((check) => check.id === 'boundaries' || enabled.includes(check.id)));
   const requestedCoverage = coverage(completed.filter((check) => check.required));
   const violation = findings.some((finding) => ['confirmed', 'conflict'].includes(finding.status) && levels[finding.severity] >= levels[threshold]);
   const report = {
      version: 1, scope,
      input: { hash: source.hash, utf16Length: source.utf16Length, byteLength: source.byteLength },
      coverage: overall, requestedCoverage, checks: completed, findings: structuredClone(findings), threshold,
      exitCode: overall === 'failed' || requestedCoverage !== 'complete' ? 2 : violation ? 1 : 0,
   };
   return deepFreeze(validate('report', report));
}
