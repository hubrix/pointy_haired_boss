import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/claude/phb-probe', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'phb-claude-'));
const cwd = join(scratch, 'workspace');
await mkdir(cwd);
const requests = [];
const checks = [];
// A local protocol stub exercises the real host's loading and hooks. It cannot
// demonstrate that a language model follows instructions or preserves meaning.
const server = createServer(async (req, res) => {
   let body = '';
   for await (const chunk of req) body += chunk;
   if (req.method !== 'POST' || !body || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404);
      res.end();
      return;
   }
   if (req.url.includes('count_tokens')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ input_tokens: 100 }));
      return;
   }
   const request = JSON.parse(body);
   requests.push(request);
   const message = {
      id: `msg_probe_${requests.length}`, type: 'message', role: 'assistant',
      model: request.model, content: [{ type: 'text', text: 'PHB_STUB_RESPONSE' }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 8 },
   };
   if (!request.stream) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(message));
      return;
   }
   res.setHeader('content-type', 'text/event-stream');
   const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
   event('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } } });
   event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
   event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'PHB_STUB_RESPONSE' } });
   event('content_block_stop', { index: 0 });
   event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } });
   event('message_stop', {});
   res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = {
   ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL'].includes(key))),
   CLAUDE_CONFIG_DIR: join(scratch, 'claude-config'),
   ANTHROPIC_API_KEY: 'phb-local-probe-no-real-key',
   ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
   DISABLE_AUTOUPDATER: '1',
   PHB_PROBE_EVENTS: join(scratch, 'events.jsonl'),
};
function run(args) {
   return new Promise((resolve, reject) => {
      const child = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
         clearTimeout(timer);
         if (code !== 0) reject(new Error(`Claude probe exited ${code}: ${stderr.slice(-1500)} ${stdout.slice(-1500)}`));
         else resolve(stdout);
      });
   });
}
const baseArgs = ['--setting-sources', '', '--strict-mcp-config', '--tools', '', '--permission-mode', 'dontAsk'];
const args = [...baseArgs, '--plugin-dir', fixture];
const promptArgs = ['-p', '--output-format', 'json', '--model', 'claude-sonnet-4-6', '--effort', 'low'];
const record = (name, evidence) => { checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); };
try {
   const version = (await run(['--version'])).trim();
   assert.equal(version, '2.1.278 (Claude Code)', 'Review the host contract after a version change.');
   const validation = JSON.parse(await run(['plugin', 'validate', '--json', '--strict', fixture]));
   assert.equal(validation.success, true);
   record('Native strict plugin validation', 'No validation errors or warnings.');
   const listing = JSON.parse(await run([...args, 'plugin', 'list', '--json']));
   assert.match(JSON.stringify(listing), /phb-probe/);
   record('Session plugin discovery', 'The native plugin list includes the --plugin-dir fixture.');
   const first = JSON.parse(await run([...args, ...promptArgs, '/phb-probe:probe']));
   assert.equal(first.is_error, false);
   assert.equal(first.result, 'PHB_STUB_RESPONSE');
   assert.ok(requests.some(request => JSON.stringify(request.messages).includes('PHB_SKILL_EXPANDED')));
   record('Manual namespaced skill expansion', 'The host sends the skill body to the local Messages endpoint.');
   let events = (await readFile(env.PHB_PROBE_EVENTS, 'utf8')).trim().split('\n').map(JSON.parse);
   assert.ok(events.some(event => event.event === 'SessionStart' && event.source === 'startup'));
   assert.ok(events.some(event => event.event === 'UserPromptSubmit'));
   assert.ok(requests.some(request => JSON.stringify(request).includes('PHB_HOOK_SessionStart')));
   assert.ok(requests.some(request => JSON.stringify(request).includes('PHB_HOOK_UserPromptSubmit')));
   record('Startup and prompt hooks execute and deliver context', 'Both event markers reach the local model request.');
   const before = requests.length;
   const resumed = JSON.parse(await run([...args, ...promptArgs, '--resume', first.session_id, 'Continue the fixture test.']));
   assert.equal(resumed.is_error, false);
   assert.ok(requests.length > before);
   events = (await readFile(env.PHB_PROBE_EVENTS, 'utf8')).trim().split('\n').map(JSON.parse);
   assert.ok(events.some(event => event.event === 'SessionStart' && event.source === 'resume'));
   record('Native resume lifecycle', 'A resumed print session fires SessionStart with source=resume.');
   const compacted = JSON.parse(await run([...args, ...promptArgs, '--resume', first.session_id, '/compact']));
   assert.equal(compacted.is_error, false);
   assert.equal(compacted.local_command, 'compact');
   events = (await readFile(env.PHB_PROBE_EVENTS, 'utf8')).trim().split('\n').map(JSON.parse);
   assert.ok(events.some(event => event.event === 'PreCompact'));
   assert.ok(events.some(event => event.event === 'SessionStart' && event.source === 'compact'));
   const afterCompact = requests.length;
   await run([...args, ...promptArgs, '--resume', first.session_id, 'Continue after compaction.']);
   assert.ok(requests.slice(afterCompact).some(request => JSON.stringify(request).includes('PHB_HOOK_SessionStart_compact')));
   record('Native compaction and context refresh', 'The host fires PreCompact and SessionStart(compact); refreshed context reaches the next request.');
   const beforeSibling = requests.length;
   const sibling = JSON.parse(await run([...args, ...promptArgs, 'Reply with the test response.']));
   assert.notEqual(sibling.session_id, first.session_id);
   assert.ok(requests.length > beforeSibling);
   assert.ok(requests.slice(beforeSibling).every(request => !JSON.stringify(request.messages).includes('PHB_SKILL_EXPANDED')));
   assert.ok(requests.slice(beforeSibling).every(request => !JSON.stringify(request).includes('Test PHB host skill expansion')));
   record('Manual-only skill and sibling session isolation', 'A fresh session receives no skill body without explicit invocation.');
   const beforeDisabled = requests.length;
   const eventsBeforeDisabled = await readFile(env.PHB_PROBE_EVENTS, 'utf8');
   await run([...baseArgs, ...promptArgs, 'Reply with the test response.']);
   assert.ok(requests.length > beforeDisabled);
   assert.ok(requests.slice(beforeDisabled).every(request => !JSON.stringify(request).includes('PHB_HOOK_')));
   assert.equal(await readFile(env.PHB_PROBE_EVENTS, 'utf8'), eventsBeforeDisabled);
   record('Session-only plugin loading', 'A fresh invocation without --plugin-dir receives no fixture hook context and runs no fixture hooks.');
   const result = { recordedAt: new Date().toISOString(), node: process.version, host: { version }, model: 'localhost protocol stub; no live language model', checks,
      unverified: ['Real model compliance', 'On/off supersession within an existing conversation', 'Interactive UI', 'Production adapter', 'Pre-delivery enforcement'] };
   await writeFile(new URL('../../docs/spikes/claude-results.json', import.meta.url), JSON.stringify(result, null, 3) + '\n');
} finally {
   server.closeAllConnections();
   await new Promise(resolve => server.close(resolve));
   await rm(scratch, { recursive: true, force: true });
}
