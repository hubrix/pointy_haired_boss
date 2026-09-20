import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
assert.equal(version, 'codex-cli 0.154.0', 'Review the host contract after a version change.');
const scratch = await mkdtemp(join(tmpdir(), 'phb-codex-turns-'));
await mkdir(join(scratch, '.agents', 'skills'), { recursive: true });
await cp(fileURLToPath(new URL('./fixtures/codex/phb-probe/skills/probe', import.meta.url)), join(scratch, '.agents/skills/probe'), { recursive: true });
const requests = [];
const server = createServer(async (req, res) => {
   let body = '';
   for await (const chunk of req) body += chunk;
   if (req.method !== 'POST' || !body || !req.url.endsWith('/responses')) {
      res.writeHead(404); res.end(); return;
   }
   requests.push(JSON.parse(body));
   const message = { id: `msg_${requests.length}`, type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: 'PHB_STUB_RESPONSE', annotations: [] }] };
   const response = { id: `resp_${requests.length}`, object: 'response', status: 'completed', output: [message],
      usage: { input_tokens: 100, output_tokens: 8, total_tokens: 108 } };
   res.setHeader('content-type', 'text/event-stream');
   const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
   event('response.created', { response: { ...response, status: 'in_progress', output: [] } });
   event('response.output_item.added', { output_index: 0, item: { ...message, status: 'in_progress', content: [] } });
   event('response.content_part.added', { item_id: message.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
   event('response.output_text.delta', { item_id: message.id, output_index: 0, content_index: 0, delta: 'PHB_STUB_RESPONSE' });
   event('response.output_text.done', { item_id: message.id, output_index: 0, content_index: 0, text: 'PHB_STUB_RESPONSE' });
   event('response.content_part.done', { item_id: message.id, output_index: 0, content_index: 0, part: message.content[0] });
   event('response.output_item.done', { output_index: 0, item: message });
   event('response.completed', { response });
   res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json', '-C', scratch,
   '-s', 'read-only', '-m', 'phb-probe', '-c', 'model_provider="phb-probe"',
   '-c', `model_providers.phb-probe={name="PHB local stub",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false}`];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL'].includes(key)));
function run(prompt) {
   return new Promise((resolve, reject) => {
      const child = spawn('codex', [...args, prompt], { cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', error = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
         clearTimeout(timer);
         if (code !== 0) reject(new Error(`Codex probe exited ${code}: ${error.slice(-2000)} ${output.slice(-2000)}`));
         else resolve(output);
      });
   });
}
try {
   const ordinary = await run('Reply with the test response.');
   assert.match(ordinary, /PHB_STUB_RESPONSE/);
   assert.ok(requests.length > 0);
   assert.ok(requests.every(request => !JSON.stringify(request).includes('PHB_SKILL_EXPANDED')));
   assert.ok(requests.every(request => !JSON.stringify(request).includes('Test PHB host skill expansion')));
   console.log('PASS Manual-only skill body absent from an ordinary turn');
   const before = requests.length;
   const explicit = await run('Use $probe to perform the fixture test.');
   assert.match(explicit, /PHB_STUB_RESPONSE/);
   assert.ok(requests.slice(before).some(request => JSON.stringify(request).includes('PHB_SKILL_EXPANDED')));
   console.log('PASS Manual skill body expanded into a native turn');
   await writeFile(new URL('../../docs/spikes/codex-turns-results.json', import.meta.url), JSON.stringify({
      recordedAt: new Date().toISOString(), node: process.version, host: { version }, model: 'localhost Responses protocol stub; no live language model',
      checks: [
         { name: 'Manual-only skill body absent from an ordinary turn', pass: true },
         { name: 'Manual skill body expanded into a native turn', pass: true },
      ],
      unverified: ['Installed plugin activation and namespaced invocation', 'Hook execution and trust', 'On/off supersession', 'Resume and compaction', 'Real model compliance'],
   }, null, 3) + '\n');
} finally {
   server.closeAllConnections();
   await new Promise(resolve => server.close(resolve));
   await rm(scratch, { recursive: true, force: true });
}
