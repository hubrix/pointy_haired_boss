import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig, parseConfig, houseProfile } from '../../src/contracts/config.mjs';
import { ruleIds, rules, houseBanIds } from '../../src/contracts/catalog.mjs';
import { validate, ContractError } from '../../src/contracts/validate.mjs';

test('catalog includes every documented rule and validates versioned records', async () => {
   const document = await readFile(new URL('../../docs/RULES.md', import.meta.url), 'utf8');
   const documented = [...document.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((match) => match[1]);
   assert.deepEqual([...ruleIds].sort(), documented.sort());
   assert.equal(new Set(ruleIds).size, ruleIds.length);
   for (const rule of rules) validate('rule', rule);
   assert.throws(() => validate('rule', { ...rules[0], detector: { type: 'probability', requiresContext: false } }), ContractError);
});

test('all intensity levels retain four bans and the reading/style defaults', () => {
   for (const intensity of ['light', 'normal', 'strict']) {
      const { config } = resolveConfig({ invocation: { version: 1, intensity } });
      for (const id of houseBanIds) assert.equal(config.rules[id], 'error');
      assert.equal(config.readability.targetMaxGrade, 8);
      assert.equal(config.styleGuide.edition, 18);
   }
});

test('explicit rule overrides work without weakening fidelity', () => {
   assert.equal(resolveConfig({ project: { version: 1, rules: { 'GRAM-01': 'off' } } }).config.rules['GRAM-01'], 'off');
   assert.throws(() => resolveConfig({ project: { version: 1, rules: { 'FID-04': 'off' } } }), /Fidelity/);
   assert.throws(() => resolveConfig({ project: { version: 1, suppressions: [{ ruleIds: ['FID-02'], reason: 'Skip it' }] } }), /Fidelity/);
});

test('configuration precedence merges maps and replaces arrays with traceable origins', () => {
   const input = {
      profiles: [{ version: 1, name: 'memo', description: 'Short project memos.', settings: { audience: 'Board members', register: 'Formal', readability: { targetMaxGrade: 7 } } }],
      user: { version: 1, readability: { targetMaxGrade: 9 }, forbiddenPhrases: ['user phrase'] },
      project: { version: 1, profile: 'memo', readability: { minWords: 120 }, overrides: [
         { files: ['docs/**/*.md'], settings: { readability: { targetMaxGrade: 6 }, forbiddenPhrases: ['project phrase'] } },
         { files: ['docs/board.md'], settings: { register: 'Board memo', intensity: 'strict' } },
      ] },
      invocation: { version: 1, readability: { targetMaxGrade: 8 }, allowedTerms: [], intensity: 'light' },
      path: './docs/board.md',
   };
   const before = structuredClone(input);
   const result = resolveConfig(input);
   assert.deepEqual(input, before);
   assert.equal(result.config.profile, 'memo');
   assert.equal(result.config.audience, 'Board members');
   assert.equal(result.config.register, 'Board memo');
   assert.deepEqual(result.config.readability, { metric: 'flesch-kincaid', targetMaxGrade: 8, minWords: 120 });
   assert.deepEqual(result.config.forbiddenPhrases, ['project phrase']);
   assert.deepEqual(result.config.allowedTerms, []);
   assert.equal(result.config.intensity, 'light');
   assert.equal(result.provenance['readability.targetMaxGrade'], 'invocation');
   assert.equal(result.provenance.register, 'project.overrides[1]');
   assert.deepEqual(result.matchedOverrides, ['project.overrides[0]', 'project.overrides[1]']);
   assert.throws(() => { result.config.rules['CLR-01'] = 'off'; }, TypeError);
});

test('highest profile selector chooses defaults while explicit settings retain precedence', () => {
   const profiles = ['memo', 'guide'].map((name) => ({ version: 1, name, description: name, settings: { register: name } }));
   const { config } = resolveConfig({ profiles, user: { version: 1, profile: 'memo', audience: 'Specialists' }, invocation: { version: 1, profile: 'guide' } });
   assert.equal(config.profile, 'guide');
   assert.equal(config.register, 'guide');
   assert.equal(config.audience, 'Specialists');
});

test('unknown profiles, duplicate profiles, and invalid inactive overrides fail', () => {
   assert.throws(() => resolveConfig({ project: { version: 1, profile: 'missing' } }), /Unknown profile/);
   assert.throws(() => resolveConfig({ profiles: [houseProfile] }), /Duplicate or reserved/);
   assert.throws(() => resolveConfig({ project: { version: 1, overrides: [{ files: ['other/**'], settings: { profile: 'missing' } }] }, path: 'docs/a.md' }), /Unknown profile/);
   assert.throws(() => resolveConfig({ project: { version: 1, overrides: [{ files: ['other/**'], settings: { rules: { 'NOT-A-RULE': 'off' } } }] } }), ContractError);
});

for (const [name, config] of [
   ['unknown key', { version: 1, intenstity: 'strict' }],
   ['version', { version: 2 }],
   ['missing version', { intensity: 'normal' }],
   ['wrong type', { version: 1, readability: { targetMaxGrade: '8' } }],
   ['unknown rule', { version: 1, rules: { 'BAD-01': 'error' } }],
   ['unsupported locale', { version: 1, locale: 'fr-FR' }],
   ['unsupported Unicode policy', { version: 1, unicode: { policy: 'ascii' } }],
   ['blank phrase', { version: 1, forbiddenPhrases: [' '] }],
   ['empty suppression reason', { version: 1, suppressions: [{ ruleIds: ['LEX-01'], reason: ' ' }] }],
]) test(`configuration rejects ${name}`, () => assert.throws(() => resolveConfig({ project: config }), ContractError));

test('phrase inputs reject silent trimming, multiline strings, and contradictory terminology', () => {
   for (const term of [' term', 'term ', 'one\ntwo', '\ud800']) assert.throws(() => resolveConfig({ project: { version: 1, forbiddenPhrases: [term] } }), ContractError);
   assert.throws(() => resolveConfig({ project: { version: 1, requiredTerminology: [{ preferred: 'Build server', avoid: ['build\tserver'] }] } }), /preferred term/);
   assert.throws(() => resolveConfig({ project: { version: 1, requiredTerminology: [{ preferred: 's', avoid: ['ſ'] }] } }), /preferred term/);
   assert.doesNotThrow(() => resolveConfig({ project: { version: 1, matching: { caseSensitive: true }, requiredTerminology: [{ preferred: 'PHB', avoid: ['phb'] }] } }));
});

test('path overrides honor dotfiles and project-relative boundaries', () => {
   const project = { version: 1, overrides: [{ files: ['docs/**/*.md'], settings: { intensity: 'strict' } }] };
   assert.equal(resolveConfig({ project, path: 'docs/.notes/a.md' }).config.intensity, 'strict');
   assert.equal(resolveConfig({ project }).config.intensity, 'normal');
   assert.equal(resolveConfig({ path: 'node_modules/a.md' }).excluded, true);
   for (const path of ['../a.md', '/tmp/a.md', 'docs/../a.md', 'C:\\tmp\\a.md']) assert.throws(() => resolveConfig({ path }), /Path must/);
   for (const pattern of ['!docs/**', '../**', '/tmp/**', 'docs/[']) assert.throws(() => resolveConfig({ project: { version: 1, exclude: [pattern] } }), ContractError);
});

test('JSON configuration cannot add inherited prototype settings', () => {
   assert.throws(() => parseConfig('{"version":1,"__proto__":{"rules":{"GRAM-01":"off"}}}'), ContractError);
   assert.throws(() => parseConfig('{broken'), /valid JSON/);
   assert.equal({}.polluted, undefined);
});
