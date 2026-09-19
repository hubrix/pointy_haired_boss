import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { proseSpans, sentinelHits } from './spans.mjs';
import { fixtures, expectedHits, boundaryGaps, grammarFixtures } from './fixtures.mjs';

const root = new URL('../../', import.meta.url);
const paragraph = 'Maya quietly reviewed the report and sent the revised draft to the board. The team approved the budget for next year.';
const words = paragraph.split(/\s+/).length;
const corpus = Array.from({ length: Math.ceil(10_000 / words) }, () => paragraph).join('\n\n');
const engines = ['remark', 'textlint'];
const load = async (engine) => (await import(`./${engine}.mjs`)).parseMarkdown;

if (process.argv[2] === '--cold') {
   const parse = await load(process.argv[3]);
   const spans = proseSpans(parse(corpus), corpus);
   if (sentinelHits(spans).length !== Math.ceil(10_000 / words)) throw new Error('Missing corpus hits');
   process.exit(0);
}

const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
function resolveDependency(from, name) {
   let base = from;
   while (true) {
      const key = `${base ? base + '/' : ''}node_modules/${name}`;
      if (lock.packages[key]) return key;
      if (!base) return undefined;
      const index = base.lastIndexOf('/node_modules/');
      base = index < 0 ? '' : base.slice(0, index);
   }
}

async function ownBytes(path) {
   let bytes = 0;
   for (const item of await readdir(path, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.isSymbolicLink()) continue;
      const child = new URL(`${item.name}${item.isDirectory() ? '/' : ''}`, path);
      if (item.isDirectory()) bytes += await ownBytes(child);
      else if (item.isFile()) bytes += (await stat(child)).size;
   }
   return bytes;
}

async function footprint(names) {
   const seen = new Set();
   async function visit(key) {
      if (!key || seen.has(key)) return;
      seen.add(key);
      const pkg = lock.packages[key];
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
         await visit(resolveDependency(key, name));
      }
   }
   for (const name of names) await visit(resolveDependency('', name));
   let bytes = 0;
   for (const key of seen) bytes += await ownBytes(new URL(key + '/', root));
   return { roots: names, packageCount: seen.size, installedFileBytes: bytes };
}

const round = (value) => Number(value.toFixed(2));
function distribution(values) {
   const samples = values.map(round);
   const sorted = [...samples].sort((a, b) => a - b);
   const middle = Math.floor(sorted.length / 2);
   const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
   return { runs: sorted.length, medianMs: round(median), p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], samplesMs: samples };
}

const result = {
   recordedAt: new Date().toISOString(),
   environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model },
   scope: 'Parser plus common source-span extraction and sentinel scan. No grammar, contextual review, file IO, or full checker latency in these timings.',
   corpus: { words: corpus.split(/\s+/).length, utf16Units: corpus.length },
   engines: {},
};

for (const engine of engines) {
   const parse = await load(engine);
   const cases = [...fixtures, ...boundaryGaps].map((fixture) => {
      const expected = expectedHits(fixture);
      const actual = sentinelHits(proseSpans(parse(fixture.source), fixture.source));
      return { id: fixture.id, scope: boundaryGaps.includes(fixture) ? 'known-policy-gap' : 'parser-boundary', passed: isDeepStrictEqual(expected, actual), expected, actual };
   });
   const cold = [];
   for (let run = 0; run < 7; run++) {
      const start = performance.now();
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--cold', engine], { encoding: 'utf8' });
      if (child.status !== 0) throw new Error(child.stderr || 'Cold process failed');
      cold.push(performance.now() - start);
   }
   const warm = [];
   for (let run = 0; run < 22; run++) {
      const start = performance.now();
      sentinelHits(proseSpans(parse(corpus), corpus));
      if (run >= 2) warm.push(performance.now() - start);
   }
   result.engines[engine] = { cases, coldProcessAndScan: distribution(cold), warmParseAndScan: distribution(warm) };
}

result.dependencies = {
   remark: await footprint(['unified', 'remark-parse', 'remark-gfm', 'remark-frontmatter', 'remark-math']),
   textlintParser: await footprint(['@textlint/textlint-plugin-markdown']),
   textlintWithKernel: await footprint(['@textlint/kernel', '@textlint/textlint-plugin-markdown']),
   grammar: await footprint(['compromise']),
};
const { grammarCandidates } = await import('./grammar.mjs');
result.grammar = grammarFixtures.map(({ text, ...expected }) => {
   const actual = grammarCandidates(text);
   return { text, expected, actual, passed: isDeepStrictEqual(expected, actual) };
});

const destination = new URL('docs/spikes/parser-results.json', root);
await mkdir(new URL('./', destination), { recursive: true });
await writeFile(destination, JSON.stringify(result, null, 3) + '\n');
console.log(JSON.stringify({
   saved: 'docs/spikes/parser-results.json',
   parsers: Object.fromEntries(engines.map((name) => [name, {
      parserCasesPassed: result.engines[name].cases.filter((item) => item.scope === 'parser-boundary' && item.passed).length,
      parserCases: fixtures.length,
      uncovered: result.engines[name].cases.filter((item) => !item.passed).map((item) => item.id),
      cold: result.engines[name].coldProcessAndScan,
      warm: result.engines[name].warmParseAndScan,
   }])),
   grammarPassed: result.grammar.filter((item) => item.passed).length,
   grammarCases: result.grammar.length,
   grammarMisses: result.grammar.filter((item) => !item.passed),
   dependencies: result.dependencies,
}, null, 3));
