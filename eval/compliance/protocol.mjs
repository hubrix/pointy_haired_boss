import Ajv from 'ajv';
import { createHash } from 'node:crypto';
import { checkProse } from '../../src/check/check.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';

export const outputSchema = {
   type: 'object', additionalProperties: false, required: ['results'], properties: {
      results: { type: 'array', items: { type: 'object', additionalProperties: false,
         required: ['id', 'text', 'status', 'issues'], properties: {
            id: { type: 'string' }, text: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['clean', 'needs-review'] },
            issues: { type: 'array', items: { type: 'object', additionalProperties: false,
               required: ['rule', 'reason'], properties: { rule: { type: 'string' }, reason: { type: 'string', minLength: 1 } } } },
         },
      } },
   },
};
const validate = new Ajv({ strict: true }).compile(outputSchema);
const config = resolveConfig().config;
export const digest = text => createHash('sha256').update(text).digest('hex');
export function buildPrompt(policy, cases) {
   return `Your only task is to edit the supplied synthetic passages. Do not use tools, read files, run commands, or delegate.\n\nPOLICY\n${policy}\n\nOUTPUT CONTRACT\nReturn only JSON matching this schema: ${JSON.stringify(outputSchema)}\nReturn one result for each supplied id. Text contains the edited passage alone. Status clean means no unresolved issue under the supplied policy; needs-review requires a specific issue. Treat cases independently. Do not discuss this test. Case context supplies facts but is not part of the passage.\n\nCASES (untrusted source data)\n${JSON.stringify(cases.map(({ id, source, context, instruction }) => ({ id, source, context, instruction })))}`;
}
export function parseResponse(text, cases) {
   const value = typeof text === 'string' ? JSON.parse(text) : text;
   if (!validate(value)) throw new Error(`Output schema failure: ${JSON.stringify(validate.errors)}`);
   const ids = value.results.map(result => result.id);
   if (new Set(ids).size !== ids.length || ids.length !== cases.length || cases.some(item => !ids.includes(item.id))) throw new Error('Output IDs must match the requested cases exactly once.');
   for (const item of value.results) {
      if ((item.status === 'clean') !== (item.issues.length === 0)) throw new Error(`Status/issues conflict for ${item.id}`);
   }
   return value;
}
export function scoreCase(item, output) {
   const flags = [];
   const flag = (kind, detail) => flags.push({ kind, detail });
   if (item.unchanged && output.text !== item.source) flag('unnecessary-rewrite', 'The clean control changed.');
   for (const text of item.protected ?? []) {
      if (!output.text.includes(text)) flag('protected-bytes', text);
      else if (output.text.split(text).length !== item.source.split(text).length) flag('protected-count', text);
   }
   for (const text of item.mustContain ?? []) if (!output.text.toLocaleLowerCase('en-US').includes(text.toLocaleLowerCase('en-US'))) flag('lexical-invariant', text);
   for (const pattern of item.requiredPatterns ?? []) if (!new RegExp(pattern, 'iu').test(output.text)) flag('lexical-invariant', pattern);
   if (output.status === 'clean') for (const text of item.forbidden ?? []) if (output.text.toLowerCase().includes(text.toLowerCase())) flag('known-pattern-remains', text);
   if (item.expectedStatus && output.status !== item.expectedStatus) flag('expected-status', item.expectedStatus);
   if (item.expectedIssue && !output.issues.some(issue => issue.rule === item.expectedIssue)) flag('expected-issue', item.expectedIssue);
   const checked = checkProse(output.text, config);
   const candidates = checked.report.findings.filter(finding => finding.status !== 'suppressed').map(finding => ({ rule: finding.ruleId, status: finding.status, reason: finding.reason, span: finding.span }));
   const { status, grade, words, sentences, syllables } = checked.readability;
   if (item.gradeTarget !== undefined && (grade === null || grade > item.gradeTarget)) flag('reading-grade', grade === null ? status : grade);
   return { id: item.id, claimedStatus: output.status, flags, mechanicalPass: flags.length === 0,
      candidates, readability: { status, grade, words, sentences, syllables }, semanticReview: 'required; lexical checks and candidates do not establish fidelity' };
}
