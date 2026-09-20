import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const version = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
assert.equal(version, 'codex-cli 0.154.0', 'Review the host contract after a version change.');
const scratch = await realpath(await mkdtemp(join(tmpdir(), 'phb-codex-')));
const fixture = join(scratch, 'plugins', 'phb-probe');
await cp(fileURLToPath(new URL('./fixtures/codex/phb-probe', import.meta.url)), fixture, { recursive: true });
const marketplacePath = join(scratch, '.agents', 'plugins', 'marketplace.json');
await mkdir(join(scratch, '.agents', 'plugins'), { recursive: true });
// A disposable catalog is input to plugin/read. Nothing is installed or added
// to the user's marketplaces, config, skill roots, or hook trust store.
await writeFile(marketplacePath, JSON.stringify({
   name: 'phb-probe-test', plugins: [{
      name: 'phb-probe', source: { source: 'local', path: './plugins/phb-probe' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
   }],
}));
const child = spawn('codex', ['app-server', '--stdio'], { cwd: scratch, stdio: ['pipe', 'pipe', 'pipe'] });
const lines = createInterface({ input: child.stdout });
let nextId = 0;
const pending = new Map();
child.stderr.resume();
lines.on('line', line => {
   const message = JSON.parse(line);
   const call = pending.get(message.id);
   if (!call) return;
   pending.delete(message.id);
   clearTimeout(call.timer);
   if (message.error) call.reject(new Error(JSON.stringify(message.error)));
   else call.resolve(message.result);
});
function request(method, params) {
   return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
   });
}
const checks = [];
const record = (name, evidence) => { checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); };
try {
   await request('initialize', { clientInfo: { name: 'phb-host-probe', version: '0.0.0' }, capabilities: { experimentalApi: true } });
   child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
   const detail = await request('plugin/read', { marketplacePath, pluginName: 'phb-probe' });
   assert.equal(detail.plugin.summary.name, 'phb-probe');
   assert.ok(detail.plugin.skills.some(skill => skill.name === 'phb-probe:probe'));
   record('Native plugin catalog read', 'The app-server reads the manifest and bundled skill from a disposable local catalog.');
   assert.deepEqual(detail.plugin.hooks.map(hook => hook.eventName).sort(), ['sessionStart', 'userPromptSubmit']);
   record('Plugin hook discovery', 'The native catalog exposes both fixture hook events; execution and trust remain unverified.');
   await request('skills/extraRoots/set', { extraRoots: [join(fixture, 'skills')] });
   const catalog = await request('skills/list', { cwds: [scratch], forceReload: true });
   const entry = catalog.data.flatMap(item => item.skills).find(skill => skill.path === join(fixture, 'skills', 'probe', 'SKILL.md'));
   assert.ok(entry, 'The extra-root fixture must appear in the native skill catalog.');
   assert.equal(entry.interface.displayName, 'PHB probe');
   record('Connection-scoped skill discovery', 'skills/list reads the extra root and agents/openai.yaml interface metadata. The API does not expose invocation policy.');
   await request('skills/extraRoots/set', { extraRoots: [] });
   const cleared = await request('skills/list', { cwds: [scratch], forceReload: true });
   assert.ok(!cleared.data.flatMap(item => item.skills).some(skill => skill.path === entry.path));
   record('Remove connection-scoped skill roots', 'Clearing extraRoots removes the fixture from the refreshed catalog.');
   const result = { recordedAt: new Date().toISOString(), node: process.version, host: { version }, model: 'No model calls', checks,
      unverified: ['Installed plugin activation', 'Manual invocation in a turn', 'Manual-only policy enforcement', 'Hook trust and execution', 'On/off supersession', 'Resume and compaction', 'Interactive UI', 'Production adapter', 'Pre-delivery enforcement'] };
   await writeFile(new URL('../../docs/spikes/codex-results.json', import.meta.url), JSON.stringify(result, null, 3) + '\n');
} finally {
   for (const call of pending.values()) clearTimeout(call.timer);
   lines.close();
   child.kill('SIGTERM');
   await rm(scratch, { recursive: true, force: true });
}
