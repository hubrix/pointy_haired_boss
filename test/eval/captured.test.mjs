import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPrompt, digest, parseResponse, scoreCase } from '../../eval/compliance/protocol.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const corpusText = read('../../eval/compliance/cases.json');
const corpus = JSON.parse(corpusText);
const policies = { generic: read('../../eval/compliance/baseline.md'), phb: read('../../eval/compliance/policy.md') };
const files = ['codex.json', 'claude-r2.json'];

test('captured cloud results retain their frozen inputs, response contracts, and original scores', () => {
   for (const file of files) {
      const result = JSON.parse(read(`../../docs/eval/pilot-v1/${file}`));
      assert.equal(result.corpus.sha256, digest(corpusText));
      for (const [name, policy] of Object.entries(policies)) assert.equal(result.policyHashes[name], digest(policy));
      for (const run of result.runs) {
         const cases = run.caseIds.map(id => corpus.cases.find(item => item.id === id));
         assert.equal(run.promptSha256, digest(buildPrompt(policies[run.condition], cases)));
         const response = parseResponse(run.raw, cases);
         assert.deepEqual(response.results, run.outputs);
         const scores = cases.map(item => scoreCase(item, response.results.find(output => output.id === item.id)));
         assert.deepEqual(scores, run.scores, 'Do not silently replace the original pilot grader; version later scoring.');
      }
   }
});

test('the captured clean claim cannot hide the protected nonbreaking-space mutation', () => {
   const result = JSON.parse(read('../../docs/eval/pilot-v1/claude-r2.json'));
   const output = result.runs.find(run => run.condition === 'phb' && run.batch === 1).outputs.find(item => item.id === 'unicode-preserve');
   const fixture = corpus.cases.find(item => item.id === output.id);
   assert.equal(output.status, 'clean');
   assert.ok(fixture.source.includes('10\u00a0kg'));
   assert.ok(output.text.includes('10 kg'));
   assert.ok(scoreCase(fixture, output).flags.some(flag => flag.kind === 'protected-bytes'));
});
