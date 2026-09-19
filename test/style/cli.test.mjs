import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../bin/phb.mjs', import.meta.url));
const dense = 'Implementation of the methodology necessitates consideration of interdependencies. ';
const run = (input, args = []) => spawnSync(process.execPath, [cli, 'check', ...args, '-'], { input, encoding: 'utf8' });

test('CLI JSON exposes metric details, editions, warnings, and required coverage', () => {
   const result = run(dense.repeat(15), ['--format', 'json', '--require', 'READ-01', '--threshold', 'warning']);
   assert.equal(result.status, 1, result.stderr);
   const document = JSON.parse(result.stdout).documents[0];
   assert.equal(document.readability.status, 'measured');
   assert.equal(document.readability.words, 120);
   assert.equal(document.chicago.rules.length, 6);
   assert.equal(document.report.checks.find((item) => item.id === 'READ-01').status, 'complete');
});

test('CLI reports short samples and unavailable grades without certifying Chicago coverage', () => {
   const result = run('Read an e-book.', ['--require', 'READ-01']);
   assert.equal(result.status, 2);
   assert.match(result.stdout, /insufficient-sample/);
   assert.match(result.stdout, /grade unavailable/);
   assert.match(result.stdout, /Chicago: 6 narrow candidate checks/);
   assert.equal(run('Read a book.', ['--require', 'CMO-03']).status, 2);
});

test('file checks honor profile thresholds and remain read-only', async () => {
   const root = await mkdtemp(join(tmpdir(), 'phb-style-'));
   try {
      const text = dense.repeat(15);
      const file = join(root, 'draft.md');
      await writeFile(file, text);
      await writeFile(join(root, '.phb.json'), JSON.stringify({ version: 1, readability: { targetMaxGrade: 30 } }));
      const result = spawnSync(process.execPath, [cli, 'check', '--root', root, '--require', 'READ-01', '--threshold', 'warning', '--format', 'json', 'draft.md'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout);
      assert.equal(JSON.parse(result.stdout).documents[0].readability.targetMaxGrade, 30);
      assert.equal(await readFile(file, 'utf8'), text);
   } finally { await rm(root, { recursive: true, force: true }); }
});
