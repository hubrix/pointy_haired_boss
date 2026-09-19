import { ruleIds } from './catalog.mjs';

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const text = { type: 'string', minLength: 1, pattern: '\\S' };
const strings = { type: 'array', items: text, uniqueItems: true };
const choices = (...values) => ({ enum: values });
const integer = { type: 'integer', minimum: 0 };
const severity = choices('error', 'warning', 'suggestion', 'off');
const ruleId = { enum: ruleIds };
const range = object({ start: integer, end: integer });
const location = object({ line: { type: 'integer', minimum: 1 }, column: { type: 'integer', minimum: 1 } });
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const idList = { type: 'array', items: ruleId, uniqueItems: true, minItems: 1 };

const settings = {
   activation: choices('auto', 'manual', 'off'), intensity: choices('light', 'normal', 'strict'),
   locale: { const: 'en-US' }, audience: text, register: text,
   styleGuide: object({ name: { const: 'chicago' }, edition: { const: 18 } }),
   readability: object({ metric: { const: 'flesch-kincaid' }, targetMaxGrade: { type: 'number', minimum: 0, maximum: 30 }, minWords: { type: 'integer', minimum: 1 } }, []),
   rules: { type: 'object', propertyNames: ruleId, additionalProperties: severity },
   forbiddenPhrases: strings, allowedTerms: strings,
   requiredTerminology: { type: 'array', items: object({ preferred: text, avoid: { ...strings, minItems: 1 } }), uniqueItems: true },
   matching: object({ caseSensitive: { type: 'boolean' }, whitespace: choices('horizontal', 'literal') }, []),
   unicode: object({ policy: { const: 'conservative' } }),
   exclude: strings,
   suppressions: { type: 'array', items: object({ ruleIds: idList, reason: text, paths: { ...strings, minItems: 1 } }, ['ruleIds', 'reason']) },
};
const layerProperties = { ...settings, profile: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' } };

export const schemas = {
   config: object({ version: { const: 1 }, ...layerProperties, overrides: {
      type: 'array', items: object({ files: { ...strings, minItems: 1 }, settings: object(layerProperties, []) }),
   } }, ['version']),
   profile: object({ version: { const: 1 }, name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' }, description: text, settings: object(settings, []) }),
   rule: object({
      id: ruleId, version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      category: choices('wording', 'structure', 'grammar', 'clarity', 'readability', 'formatting', 'chicago', 'fidelity', 'unicode', 'artifacts'),
      title: text, rationale: text, sources: { type: 'array', minItems: 1, items: object({ reference: text, kind: choices('project-policy', 'external-reference') }) },
      defaultSeverity: choices('error', 'warning', 'suggestion'),
      detector: object({ type: choices('exact', 'heuristic', 'semantic'), requiresContext: { type: 'boolean' }, subtype: choices('grammar', 'metric') }, ['type', 'requiresContext']),
      scopes: { type: 'array', minItems: 1, uniqueItems: true, items: choices('prose', 'source', 'edit') },
      criteria: text, exceptions: strings, fixPolicy: choices('safe-local', 'editorial-review', 'report-only'),
      examples: { type: 'array', minItems: 2, items: object({ text, outcome: choices('review', 'preserve'), reason: text }) },
   }),
   suppression: object({ version: { const: 1 }, ruleIds: idList, range, reason: text }),
   finding: object({
      version: { const: 1 }, ruleId, ruleVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      inputHash: hash, severity: choices('error', 'warning', 'suggestion'), ruleSeverity: choices('error', 'warning', 'suggestion'),
      status: choices('confirmed', 'candidate', 'conflict', 'suppressed'),
      evidence: choices('exact', 'heuristic', 'semantic'), reason: text,
      span: object({ ...range.properties, text: { type: 'string' }, startLocation: location, endLocation: location }),
      fix: object({ inputHash: hash, range, original: { type: 'string' }, replacement: { type: 'string' }, policy: choices('safe-local', 'editorial-review') }),
      exemption: object({ kind: choices('allowlist', 'configuration', 'inline', 'protected'), reason: text }),
   }, ['version', 'ruleId', 'ruleVersion', 'inputHash', 'severity', 'ruleSeverity', 'status', 'evidence', 'reason', 'span']),
   report: object({
      version: { const: 1 }, scope: choices('local', 'editorial'),
      input: object({ hash, utf16Length: integer, byteLength: integer }),
      coverage: choices('complete', 'partial', 'failed'), requestedCoverage: choices('complete', 'partial', 'failed'),
      checks: { type: 'array', minItems: 1, items: object({
         id: { enum: ['boundaries', ...ruleIds] }, required: { type: 'boolean' },
         status: choices('complete', 'partial', 'skipped', 'failed'), reason: text,
      }, ['id', 'required', 'status']) },
      findings: { type: 'array', items: { $ref: 'urn:phb:finding:v1' } },
      threshold: choices('error', 'warning', 'suggestion'), exitCode: choices(0, 1, 2),
   }),
};

for (const [name, schema] of Object.entries(schemas)) {
   schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
   schema.$id = `urn:phb:${name}:v1`;
   schema.title = `PHB ${name} v1`;
}
