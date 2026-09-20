import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compose the existing wrapper profiles through installed DSH code. Unlike the
// CLI dump path, loadProfileDirectory does not rewrite the user's cordis.yml.
// Do not boot plugins, evaluate !!js, call wrapper configure(), or dump settings.
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: npm run spike:dsh-composition -- /path/to/wrapper/runtime /path/to/wrapper-data/dsh');
const runtime = resolve(process.argv[2]);
const dshDirectory = resolve(process.argv[3]);
const require = createRequire(join(runtime, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)));
const { loadProfileDirectory, loadOptionalPatches, composeEntries } = await load('@deepseek-ai/dsh-app-boot');
const { FileSystemSkillProvider } = await load('@deepseek-ai/dsh-skill-filesystem');
const bootVersion = JSON.parse(await readFile(join(runtime, 'node_modules/@deepseek-ai/dsh-app-boot/package.json'), 'utf8')).version;
assert.equal(bootVersion, '0.1.6-alpha.1');
const anchor = join(runtime, 'node_modules/@deepseek-ai/dsh/package.json');
const homePatches = loadOptionalPatches('phb-probe', join(dshDirectory, 'cordis.patch.yml')) ?? [];
const seededRoot = join(homedir(), '.gsd/agent/skills');
const canonical = async path => {
   try { return await realpath(path); }
   catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const seededCanonical = await canonical(seededRoot);
const profiles = [];
for (const profileName of ['dsh-tui', 'headless']) {
   const profile = loadProfileDirectory('phb-probe', join(dshDirectory, 'profiles', profileName), anchor);
   const warnings = [];
   const entries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, homePatches], message => warnings.push(message));
   assert.ok(warnings.every(message => message === 'patch: entry "workflow-worker-thread" not found'),
      `Review new skipped patches before claiming effective configuration: ${warnings.join('; ')}`);
   const filesystemEntries = entries.filter(entry => entry.name === '@deepseek-ai/dsh-skill-filesystem');
   assert.equal(filesystemEntries.length, 1, 'Review the discovery probe if the provider composition changes.');
   const entry = filesystemEntries[0];
   const config = entry.config ?? {};
   // Expressions need a real boot to resolve. Fail rather than treating !!js
   // objects as strings, executing them here, or recording a guessed root.
   for (const key of ['dshHome', 'agentsHome', 'bundledSkillDir']) {
      assert.ok(config[key] === undefined || typeof config[key] === 'string');
   }
   assert.ok(config.customSkillDirs === undefined || (Array.isArray(config.customSkillDirs) && config.customSkillDirs.every(root => typeof root === 'string')));
   const provider = new FileSystemSkillProvider({ get() { return undefined; } }, { signal: new AbortController().signal, invalidate() {} }, {
      ...config, dshHome: config.dshHome ?? dshDirectory, watch: false,
   });
   try {
      const roots = await provider.roots(resolve(runtime, '..'));
      const canonicalRoots = await Promise.all(roots.map(root => canonical(root.path)));
      profiles.push({
         profile: profileName,
         compositionWarnings: warnings,
         bundles: profile.layers.map(layer => layer.packageName),
         filesystemProviderEnabled: entry.disabled !== true,
         explicitCustomRootCount: config.customSkillDirs?.length ?? 0,
         rootCount: roots.length,
         wrapperSeedDirectoryExists: seededCanonical !== null,
         wrapperSeedDirectoryIsActiveFilesystemRoot: entry.disabled !== true && seededCanonical !== null && canonicalRoots.includes(seededCanonical),
         pluginProvidersPresent: entries.filter(row => ['dsh-ponytail', '@wenaixi/dsh-superpower'].includes(row.name) && row.disabled !== true).map(row => row.name),
      });
   } finally { await provider.dispose(); }
}
const result = {
   recordedAt: new Date().toISOString(), node: process.version, host: { appBootVersion: bootVersion },
   method: 'Read-only native composition of bundle, generated profile, and home patch layers; native filesystem-root resolution including symlinks.',
   profiles,
   unverified: ['Full plugin boot', 'Other runtime skill registrations', 'UI invocation', 'Model behavior', 'Resume and compaction'],
};
await writeFile(new URL('../../docs/spikes/dsh-composition-results.json', import.meta.url), JSON.stringify(result, null, 3) + '\n');
console.log(JSON.stringify(result, null, 3));
