import picomatch from 'picomatch';
import { deepFreeze, rules } from './catalog.mjs';
import { ContractError, validate } from './validate.mjs';
import { findPhraseMatches } from './matching.mjs';

export const houseProfile = deepFreeze({
   version: 1, name: 'house', description: 'Mark’s house style for clear English nonfiction.',
   settings: {
      activation: 'auto', intensity: 'normal', locale: 'en-US',
      audience: 'General readers', register: 'Plain, direct nonfiction',
      styleGuide: { name: 'chicago', edition: 18 },
      readability: { metric: 'flesch-kincaid', targetMaxGrade: 8, minWords: 100 },
      rules: Object.fromEntries(rules.map((rule) => [rule.id, rule.defaultSeverity])),
      forbiddenPhrases: ['delve into', "in today's fast-paced world", 'it is worth noting',
         "it's worth noting", 'ever-evolving landscape', 'a rich tapestry',
         'unlock the full potential', 'a testament to', 'in the realm of'],
      allowedTerms: ['robust regression', 'test harness'], requiredTerminology: [],
      matching: { caseSensitive: false, whitespace: 'horizontal' },
      unicode: { policy: 'conservative', bom: 'remove', remove: [] },
      exclude: ['vendor/**', 'generated/**', 'node_modules/**', '.git/**'], suppressions: [],
   },
});

export function parseConfig(json) {
   let parsed;
   try { parsed = JSON.parse(json); }
   catch { throw new ContractError('Configuration must contain valid JSON'); }
   validate('config', parsed);
   return parsed;
}

function pathPattern(pattern) {
   if (pattern.length > 1024 || pattern.startsWith('/') || pattern.startsWith('!') ||
       pattern.includes('\\') || pattern.split('/').some((part) => part === '..' || part === '.' || part === '') ||
       /^[A-Za-z]:/.test(pattern)) throw new ContractError(`Use a positive project-relative POSIX glob: ${pattern}`);
   try { return picomatch(pattern, { dot: true, nonegate: true, strictBrackets: true }); }
   catch { throw new ContractError(`Invalid path glob: ${pattern}`); }
}

export function normalizePath(path) {
   if (path === undefined || path === null) return null;
   if (typeof path !== 'string') throw new ContractError('Path must be a project-relative POSIX string');
   const normalized = path.startsWith('./') ? path.slice(2) : path;
   if (!normalized || normalized.startsWith('/') || normalized.includes('\\') ||
       /^[A-Za-z]:/.test(normalized) || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      throw new ContractError('Path must stay inside the project and use POSIX separators');
   }
   return normalized;
}

export function matchesPath(path, patterns) {
   const normalized = normalizePath(path);
   const matchers = patterns.map(pathPattern);
   return normalized !== null && matchers.some((match) => match(normalized));
}

function checkSettings(settings) {
   for (const [id, severity] of Object.entries(settings.rules ?? {})) {
      if (id.startsWith('FID-') && severity !== 'error') throw new ContractError(`Fidelity rule ${id} must remain an error`);
   }
   for (const suppression of settings.suppressions ?? []) {
      if (suppression.ruleIds.some((id) => id.startsWith('FID-'))) throw new ContractError('Fidelity checks cannot be suppressed');
      for (const pattern of suppression.paths ?? []) pathPattern(pattern);
   }
   for (const pattern of settings.exclude ?? []) pathPattern(pattern);
   for (const phrase of [...settings.forbiddenPhrases ?? [], ...settings.allowedTerms ?? [], ...(settings.requiredTerminology ?? []).flatMap((entry) => [entry.preferred, ...entry.avoid])]) {
      if (phrase.trim() !== phrase || /[\r\n]/.test(phrase) || !phrase.isWellFormed()) throw new ContractError('Phrases must be well-formed, single-line text without outer whitespace');
   }
}

function mergeSettings(target, patch, origin, provenance, prefix = '') {
   for (const [key, value] of Object.entries(patch)) {
      if (['version', 'profile', 'overrides'].includes(key) && !prefix) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
         target[key] ??= {};
         mergeSettings(target[key], value, origin, provenance, name);
      } else {
         target[key] = structuredClone(value);
         provenance[name] = origin;
      }
   }
}

export function resolveConfig({ user = { version: 1 }, project = { version: 1 }, invocation = { version: 1 }, profiles = [], path } = {}) {
   const registry = new Map([['house', houseProfile]]);
   for (const profile of profiles) {
      validate('profile', profile);
      if (registry.has(profile.name)) throw new ContractError(`Duplicate or reserved profile: ${profile.name}`);
      checkSettings(profile.settings);
      registry.set(profile.name, profile);
   }
   const normalizedPath = normalizePath(path);
   const layers = [];
   const matchedOverrides = [];
   for (const [name, layer] of [['user', user], ['project', project], ['invocation', invocation]]) {
      validate('config', layer);
      for (const setting of [layer, ...(layer.overrides ?? []).map((override) => override.settings)]) {
         checkSettings(setting);
         if (setting.profile !== undefined && !registry.has(setting.profile)) throw new ContractError(`Unknown profile: ${setting.profile}`);
      }
      layers.push({ settings: layer, origin: name });
      for (const [index, override] of (layer.overrides ?? []).entries()) {
         if (matchesPath(normalizedPath, override.files)) {
            const origin = `${name}.overrides[${index}]`;
            layers.push({ settings: override.settings, origin });
            matchedOverrides.push(origin);
         }
      }
   }
   const selected = layers.findLast((layer) => layer.settings.profile !== undefined);
   const profileName = selected?.settings.profile ?? 'house';
   const config = { version: 1, profile: profileName };
   const provenance = { profile: selected?.origin ?? 'house' };
   mergeSettings(config, houseProfile.settings, 'house', provenance);
   if (profileName !== 'house') mergeSettings(config, registry.get(profileName).settings, `profile:${profileName}`, provenance);
   for (const layer of layers) mergeSettings(config, layer.settings, layer.origin, provenance);
   validate('config', config);
   for (const entry of config.requiredTerminology) {
      const selfMatch = entry.avoid.some((term) => findPhraseMatches({ text: entry.preferred }, term, config.matching)
         .some((range) => range.start === 0 && range.end === entry.preferred.length));
      if (selfMatch) throw new ContractError('Required terminology cannot forbid its preferred term');
   }
   return deepFreeze({ config, provenance, matchedOverrides, path: normalizedPath, excluded: matchesPath(normalizedPath, config.exclude) });
}
