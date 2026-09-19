import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This probe loads the wrapper's installed libraries. It never starts a model
// session or writes to host settings, user skill directories, or the wrapper.
if (!process.argv[2]) throw new Error('Usage: npm run spike:dsh -- /path/to/wrapper/runtime');
const runtime = resolve(process.argv[2]);
const require = createRequire(join(runtime, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)));
const names = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-skill-filesystem', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-llm'];
const versions = {};
for (const name of names) {
   const file = new URL('../package.json', pathToFileURL(require.resolve(name)));
   versions[name] = JSON.parse(await readFile(file, 'utf8')).version;
   assert.equal(versions[name], name === '@deepseek-ai/cordis' ? '4.0.2' : '0.1.6-alpha.1', `Recheck changed runtime: ${name}`);
}
const { Context } = await load('@deepseek-ai/cordis');
const { SkillRegistry, isUserInvocable, isModelInvocable, renderSkillContent } = await load('@deepseek-ai/dsh-skill');
const { createScope, scopeTarget } = await load('@deepseek-ai/dsh-scope');
const { FileSystemSkillProvider } = await load('@deepseek-ai/dsh-skill-filesystem');
const { createUserMessage } = await load('@deepseek-ai/dsh-llm');
const scratch = await mkdtemp(join(tmpdir(), 'phb-dsh-probe-'));
const ctx = new Context();
const fibers = [];
const scopes = [];
const checks = [];
const check = async (name, fn) => { await fn(); checks.push({ name, passed: true }); };

try {
   const registry = ctx.plugin(SkillRegistry);
   fibers.push(registry);
   await registry.await();
   let client;
   const consumer = ctx.plugin({ name: 'phb-probe', inject: ['skills'], apply(ctx) { client = ctx; } });
   fibers.push(consumer);
   await consumer.await();
   const keyA = {};
   const keyB = {};
   const a = createScope(client, keyA);
   const b = createScope(client, keyB);
   scopes.push(a, b);

   a.ctx.skills.register({ name: 'phb-probe', description: 'Test fixture for PHB host contracts.', content: 'Preserve the supplied facts.', source: 'runtime' });
   await check('scoped registration and loading with both invocation controls', async () => {
      const skill = await client.skills.get('phb-probe', { scope: keyA });
      assert.ok(isUserInvocable(skill));
      assert.ok(isModelInvocable(skill));
      assert.match(renderSkillContent(skill), /Preserve the supplied facts/);
   });
   await check('skill isolation from sibling and global catalogs', async () => {
      assert.equal(await client.skills.get('phb-probe', { scope: keyB }), undefined);
      assert.equal(await client.skills.get('phb-probe'), undefined);
   });
   await check('manual-only invocation metadata and explicit disposal', async () => {
      const remove = b.ctx.skills.register({ name: 'phb-manual', description: 'Manual probe.', content: 'Test only.', source: 'runtime', invocation: { userInvocable: true, modelInvocable: false } });
      const skill = await client.skills.get('phb-manual', { scope: keyB });
      assert.ok(isUserInvocable(skill));
      assert.equal(isModelInvocable(skill), false);
      remove();
      assert.equal(await client.skills.get('phb-manual', { scope: keyB }), undefined);
   });

   const seededRoot = join(scratch, 'home/.gsd/agent/skills');
   const bundle = join(seededRoot, 'phb-file-probe');
   const project = join(scratch, 'project');
   await mkdir(bundle, { recursive: true });
   await mkdir(project);
   await writeFile(join(bundle, 'SKILL.md'), '---\nname: phb-file-probe\ndescription: Filesystem discovery test fixture.\n---\n\nPreserve the supplied facts.\n');
   const control = { signal: new AbortController().signal, invalidate() {} };
   const defaults = new FileSystemSkillProvider(client, control, {
      dshHome: join(scratch, 'home/.dsh'), agentsHome: join(scratch, 'home/.agents'), watch: false,
   });
   const explicit = new FileSystemSkillProvider(client, control, {
      includeDefaultRoots: false, customSkillDirs: [seededRoot], watch: false,
   });
   try {
      await check('default filesystem roots do not imply wrapper .gsd seed discovery', async () => {
         const observed = await defaults.list({ cwd: project });
         const candidates = Array.isArray(observed) ? observed : observed.candidates;
         assert.equal(candidates.some((item) => item.name === 'phb-file-probe'), false);
      });
      await check('explicit custom skill root discovers and loads the bundle', async () => {
         const observed = await explicit.list({ cwd: project });
         const candidates = Array.isArray(observed) ? observed : observed.candidates;
         const candidate = candidates.find((item) => item.name === 'phb-file-probe');
         assert.ok(candidate);
         const skill = await explicit.get(candidate, { cwd: project });
         assert.match(skill.content, /Preserve the supplied facts/);
         assert.ok(isUserInvocable(skill));
         assert.ok(isModelInvocable(skill));
      });
   } finally {
      await defaults.dispose();
      await explicit.dispose();
   }

   let enabled = true;
   const policy = createUserMessage({ content: [{ type: 'text', text: 'PHB probe policy: preserve the supplied facts.' }], source: { kind: 'phb-probe', form: 'instructions' } });
   a.ctx.on('agent/pre-step', async (_payload, next) => {
      const decision = await next();
      if (decision.kind === 'reject' || !enabled || decision.messages.some((message) => message.source.kind === 'phb-probe')) return decision;
      return { ...decision, messages: [policy, ...decision.messages] };
   });
   const dispatch = (key, decision) => client.waterfall(scopeTarget({}, key), 'agent/pre-step', {
      agent: {}, messages: decision.messages ?? [], turn: 1, step: 1, signal: new AbortController().signal,
   }, async () => decision);
   await check('scoped pre-step waterfall inserts one typed instruction per admitted batch', async () => {
      const first = await dispatch(keyA, { kind: 'enter', messages: [] });
      assert.equal(first.messages.length, 1);
      assert.equal(first.messages[0].source.form, 'instructions');
      assert.deepEqual(await dispatch(keyA, first), first);
      assert.deepEqual(await dispatch(keyA, { kind: 'reject' }), { kind: 'reject' });
      assert.deepEqual(await dispatch(keyB, { kind: 'enter', messages: [] }), { kind: 'enter', messages: [] });
   });
   await check('disabling the probe stops new event-boundary injections', async () => {
      enabled = false;
      assert.deepEqual(await dispatch(keyA, { kind: 'enter', messages: [] }), { kind: 'enter', messages: [] });
   });
   await check('scope disposal removes skills and listeners', async () => {
      enabled = true;
      await a.dispose();
      assert.equal(await client.skills.get('phb-probe', { scope: keyA }), undefined);
      assert.deepEqual(await dispatch(keyA, { kind: 'enter', messages: [] }), { kind: 'enter', messages: [] });
   });
} finally {
   for (const scope of scopes.reverse()) await scope.dispose();
   for (const fiber of fibers.reverse()) await fiber.dispose();
   await rm(scratch, { recursive: true, force: true });
}

const results = {
   recordedAt: new Date().toISOString(), node: process.version, versions, checks,
   scope: 'Real installed Cordis and DSH service APIs; synthetic pre-step events. No model calls, live sessions, host configuration writes, or shell command invocation.',
   unverified: ['manual invocation through the host UI', 'complete wrapper skill-root configuration', 'resume and compaction', 'durable on/off/profile state', 'cross-turn deduplication and cancellation', 'retraction of earlier prompt guidance', 'enforcement before model output delivery'],
};
const destination = new URL('../../docs/spikes/dsh-results.json', import.meta.url);
await mkdir(new URL('./', destination), { recursive: true });
await writeFile(destination, JSON.stringify(results, null, 3) + '\n');
console.log(JSON.stringify(results, null, 3));
