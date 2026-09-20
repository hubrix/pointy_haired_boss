import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, digest, outputSchema, parseResponse, scoreCase } from './protocol.mjs';
import { localJsonRequest } from './http.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
   const i = arg.indexOf('=');
   if (!arg.startsWith('--') || i < 3) throw new Error('Use --host=codex|claude|dsh --out=/path/to/results.json');
   return [arg.slice(2, i), arg.slice(i + 1)];
}));
if (!['codex', 'claude', 'dsh'].includes(options.host) || !options.out || Object.keys(options).some(key => !['host', 'out', 'resume-from', 'subset'].includes(key))) throw new Error('Supply --host and --out. This command makes real model calls.');
if (options.subset !== undefined && options.subset !== 'hard') throw new Error('The only optional subset is --subset=hard.');
const out = resolve(options.out);
try { await readFile(out); throw new Error('Refusing to overwrite an existing run. Choose a new --out path.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const corpusText = await read('cases.json');
const corpus = JSON.parse(corpusText);
const policies = { generic: await read('baseline.md'), phb: await read('policy.md') };
const scratch = await mkdtemp(join(tmpdir(), `phb-live-${options.host}-`));
const schemaPath = join(scratch, 'output.schema.json');
await writeFile(schemaPath, JSON.stringify(outputSchema));
const result = {
   version: 1, startedAt: new Date().toISOString(), host: options.host, node: process.version,
   corpus: { name: corpus.set, sha256: digest(corpusText), cases: corpus.cases.length },
   policyHashes: Object.fromEntries(Object.entries(policies).map(([key, value]) => [key, digest(value)])),
   design: 'Paired generic/PHB prompt-only pilot; fixed batches; three policy observations for a hard subset. No model judge or human scoring.',
   limits: ['Development pilot, not the release corpus', 'Native CLI defaults can differ between hosts', 'DSH uses its configured local endpoint directly, not a booted adapter', 'Lexical checks can flag valid alternatives and miss semantic drift', 'Heuristic findings need review', 'No blind human review or reader-preference measure'],
   runs: [],
};
if (options.subset === 'hard') {
   result.subset = 'hard';
   result.corpus.selectedCaseIds = corpus.repeatIds;
   result.design = 'Post-pilot smaller-batch follow-up: one generic and three PHB requests for the same three hard cases. Policy and token ceiling unchanged.';
}
// macOS Claude keychain lookup also needs USER/LOGNAME. Omitting them can make
// an authenticated account appear logged out in the child process.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL', 'USER', 'LOGNAME'].includes(key)));
// Auth stays in the host's normal account store. Never read, copy, or log tokens.
function command(binary, args, input) {
   return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { cwd: scratch, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 600_000);
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      child.on('close', code => {
         clearTimeout(timer);
         if (code !== 0) {
            const error = new Error(`${binary} exited ${code}`);
            // Record the reason class without retaining possible account details.
            error.category = /rate.?limit|quota|usage limit/i.test(stdout + stderr) ? 'rate-limit' : /auth|login|sign in/i.test(stdout + stderr) ? 'authentication' : 'host-process';
            reject(error);
         } else resolve({ stdout, stderr });
      });
   });
}
let invoke;
async function setup() {
   if (options.host === 'codex') {
      const config = JSON.parse(execFileSync('python3', ['-c', 'import pathlib,tomllib,json; p=pathlib.Path.home()/".codex/config.toml"; d=tomllib.loads(p.read_text()); print(json.dumps({k:d.get(k) for k in ["model","model_reasoning_effort","model_provider"]}))'], { encoding: 'utf8' }));
      if (!config.model || config.model_provider) throw new Error('This pilot requires the configured first-party Codex model; it will not substitute a provider.');
      result.backend = { version: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), requestedModel: config.model, effort: config.model_reasoning_effort ?? 'host-default', temperature: 'not exposed', resolvedModel: 'not returned by codex exec' };
      invoke = async (prompt, index) => {
         const output = join(scratch, `response-${index}.json`);
         const args = ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '-C', scratch, '-s', 'read-only', '--json', '--output-schema', schemaPath, '-o', output, '-m', config.model, '-c', 'project_doc_max_bytes=0'];
         if (config.model_reasoning_effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(config.model_reasoning_effort)}`);
         const { stdout } = await command('codex', [...args, '-'], prompt);
         const events = stdout.trim().split('\n').map(line => JSON.parse(line));
         const toolEvents = events.filter(event => event.item && ['command_execution', 'mcp_tool_call', 'web_search', 'collab_tool_call'].includes(event.item.type));
         return { raw: await readFile(output, 'utf8'), usage: events.findLast(event => event.type === 'turn.completed')?.usage ?? null, toolEventCount: toolEvents.length };
      };
   } else if (options.host === 'claude') {
      const settings = JSON.parse(await readFile(join(homedir(), '.claude/settings.json'), 'utf8'));
      if (!settings.model) throw new Error('No configured Claude model; refusing to choose a substitute.');
      result.backend = { version: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(), requestedModel: settings.model, effort: settings.effortLevel ?? 'host-default', temperature: 'not exposed', maxBudgetUsdPerCall: 3 };
      invoke = async prompt => {
         const args = ['-p', '--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--tools', '', '--permission-mode', 'dontAsk', '--no-session-persistence', '--output-format', 'json', '--json-schema', JSON.stringify(outputSchema), '--model', settings.model, '--max-budget-usd', '3'];
         if (settings.effortLevel) args.push('--effort', settings.effortLevel);
         const { stdout } = await command('claude', args, prompt);
         const response = JSON.parse(stdout);
         if (response.is_error) throw new Error(`Claude returned ${response.subtype}`);
         return { raw: typeof response.structured_output === 'object' ? JSON.stringify(response.structured_output) : response.result,
            usage: response.usage, modelUsage: response.modelUsage, reportedCostUsd: response.total_cost_usd, toolEventCount: 0 };
      };
   } else {
      const runtime = process.env.PHB_DSH_RUNTIME ?? join(homedir(), 'code/scratch/homebrew-qwen-dsh/runtime');
      const settingsPath = process.env.PHB_DSH_SETTINGS ?? join(homedir(), '.local/share/ninjaai/dsh/settings.yaml');
      const yaml = createRequire(join(runtime, 'package.json'))('yaml');
      const settings = yaml.parse(await readFile(settingsPath, 'utf8'));
      const selected = settings['agent-default-model'];
      const provider = settings['llm-pi-ai'].providers[selected.provider];
      const model = provider.models.find(model => model.id === selected.model);
      if (!model) throw new Error('The wrapper default model is missing from its provider catalog.');
      const url = new URL(provider.baseURL);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('This pilot permits the configured local DSH endpoint only; no cloud fallback.');
      result.backend = { requestedModel: model.id, displayName: model.name, provider: selected.provider, transport: 'direct local chat/completions', temperature: 0.2, maxTokens: model.maxTokens, streaming: false };
      invoke = async prompt => {
         const value = await localJsonRequest(`${provider.baseURL.replace(/\/$/, '')}/chat/completions`, {
            model: model.id, messages: [{ role: 'user', content: prompt }], temperature: 0.2,
            max_tokens: model.maxTokens, stream: false, response_format: { type: 'json_object' },
         }, provider.headers);
         return { raw: value.choices?.[0]?.message?.content ?? '', resolvedModel: value.model, usage: value.usage, finishReason: value.choices?.[0]?.finish_reason, toolEventCount: value.choices?.[0]?.message?.tool_calls?.length ?? 0 };
      };
   }
}
await mkdir(resolve(out, '..'), { recursive: true });
const persist = () => writeFile(out, JSON.stringify(result, null, 3) + '\n');
try {
   await setup();
   // Freeze both conditions before any request. No feedback or prompt tuning.
   const batches = [corpus.cases.slice(0, 9), corpus.cases.slice(9)];
   const plan = [];
   for (let batch = 0; batch < batches.length; batch++) for (const condition of ['generic', 'phb']) plan.push({ condition, repetition: 1, batch, cases: batches[batch] });
   const subset = corpus.cases.filter(item => corpus.repeatIds.includes(item.id));
   for (const repetition of [2, 3]) plan.push({ condition: 'phb', repetition, batch: 0, cases: subset });
   if (options.subset === 'hard') plan.splice(0, plan.length,
      { condition: 'generic', repetition: 1, batch: 0, cases: subset },
      ...[1, 2, 3].map(repetition => ({ condition: 'phb', repetition, batch: 0, cases: subset })));
   if (options['resume-from']) {
      const previousText = await readFile(resolve(options['resume-from']), 'utf8');
      const previous = JSON.parse(previousText);
      if (previous.host !== result.host || (previous.subset ?? 'full') !== (result.subset ?? 'full') || previous.corpus.sha256 !== result.corpus.sha256 ||
          JSON.stringify(previous.policyHashes) !== JSON.stringify(result.policyHashes) ||
          JSON.stringify(previous.backend) !== JSON.stringify(result.backend)) throw new Error('Resume requires identical host, model settings, corpus, and policy.');
      for (const [index, record] of previous.runs.entries()) {
         if (record.status !== 'completed') break;
         const step = plan[index];
         if (!step || record.promptSha256 !== digest(buildPrompt(policies[step.condition], step.cases))) throw new Error('Resume prompt mismatch.');
         parseResponse(record.raw, step.cases);
         result.runs.push(record);
      }
      result.resumedFrom = { filename: options['resume-from'], sha256: digest(previousText), completedRequestsReused: result.runs.length };
   }
   for (const step of plan.slice(result.runs.length)) {
      const prompt = buildPrompt(policies[step.condition], step.cases);
      const record = { condition: step.condition, repetition: step.repetition, batch: step.batch, caseIds: step.cases.map(item => item.id), promptSha256: digest(prompt), startedAt: new Date().toISOString() };
      const started = performance.now();
      try {
         const response = await invoke(prompt, result.runs.length);
         Object.assign(record, response);
         if (response.toolEventCount) throw new Error('Unexpected tool activity during a prose-only evaluation.');
         const parsed = parseResponse(response.raw, step.cases);
         record.outputs = parsed.results;
         record.scores = step.cases.map(item => scoreCase(item, parsed.results.find(output => output.id === item.id)));
         record.status = 'completed';
         console.log(`${options.host} ${step.condition} r${step.repetition} batch${step.batch}: ${record.scores.filter(score => score.mechanicalPass).length}/${step.cases.length} without mechanical flags`);
      } catch (error) {
         record.status = 'error'; record.error = { message: error.message, category: error.category ?? 'request-or-output', cause: error.cause?.code ?? error.code ?? null };
         console.log(`${options.host} ${step.condition} r${step.repetition} batch${step.batch}: ERROR ${error.message}`);
      }
      record.latencyMs = Math.round(performance.now() - started);
      result.runs.push(record);
      await persist();
      if (record.status === 'error' && !record.raw) break;
   }
   result.finishedAt = new Date().toISOString();
   await persist();
   if (result.runs.some(run => run.status === 'error')) process.exitCode = 1;
} catch (error) {
   result.setupError = error.message;
   await persist();
   throw error;
} finally { await rm(scratch, { recursive: true, force: true }); }
