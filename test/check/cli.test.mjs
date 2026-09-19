import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/check/cli.mjs';

async function workspace(t, files = {}) {
   const root = await mkdtemp(join(tmpdir(), 'phb-check-'));
   t.after(() => rm(root, { recursive: true, force: true }));
   for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), typeof content === 'object' && !Buffer.isBuffer(content) ? JSON.stringify(content) : content);
   }
   return root;
}

async function invoke(root, args, input = '') {
   let output = '';
   const code = await runCli(['check', '--format', 'json', ...args], { cwd: root,
      stdin: Readable.from([input]), stdout: { write: (text) => { output += text; } } });
   const data = JSON.parse(output);
   assert.equal(data.exitCode, code);
   return data;
}

test('stdin exposes deterministic exit status, missing checks, and original-source hashes', async (t) => {
   const root = await workspace(t);
   const clean = await invoke(root, ['-'], 'Maya approved the report.');
   assert.equal(clean.exitCode, 0);
   assert.equal(clean.documents[0].report.coverage, 'partial');
   assert.equal(clean.documents[0].report.checks.length, 41);
   assert.equal((await invoke(root, ['-'], 'We delve into it.')).exitCode, 1);
   assert.equal((await invoke(root, ['--require', 'UNI-01', '-'], 'Maya approved it.')).exitCode, 0);
   assert.equal((await invoke(root, ['--require', 'READ-01', '-'], 'Maya approved it.')).exitCode, 2);
   assert.equal((await invoke(root, ['--require', 'GRAM-01', '-'], 'Maya approved it.')).exitCode, 2);
});

test('configuration layers, profiles, path overrides, and invocation settings apply', async (t) => {
   const root = await workspace(t, {
      '.phb.json': { version: 1, profile: 'memo', overrides: [{ files: ['docs/**'], settings: { forbiddenPhrases: ['project term'] } }] },
      'memo.json': { version: 1, name: 'memo', description: 'Memo', settings: { forbiddenPhrases: ['profile term'] } },
      'user.json': { version: 1, forbiddenPhrases: ['user term'] },
      'call.json': { version: 1, forbiddenPhrases: ['call term'] },
      'docs/a.md': 'project term and call term',
   });
   const args = ['--profile-file', 'memo.json', '--user-config', 'user.json', 'docs/a.md'];
   const project = await invoke(root, args);
   assert.equal(project.documents[0].profile, 'memo');
   assert.equal(project.documents[0].report.findings[0].span.text, 'project term');
   assert.deepEqual(project.documents[0].matchedOverrides, ['project.overrides[0]']);
   const call = await invoke(root, ['--config', 'call.json', ...args]);
   assert.equal(call.documents[0].report.findings[0].span.text, 'call term');
});

test('directory discovery honors nested ignores, negations, exclusions, formats, and include globs', async (t) => {
   const root = await workspace(t, {
      '.gitignore': '*.tmp.md\nignored/\ndocs/*.md\n',
      'docs/.gitignore': '!keep.md\n',
      'docs/keep.md': 'We delve into it.', 'docs/drop.md': 'We delve into it.',
      'ignored/.gitignore': '!reinclude.md\n', 'ignored/reinclude.md': 'We delve into it.',
      'a.tmp.md': 'We delve into it.', 'good.txt': 'Maya approved it.',
      'vendor/a.md': 'We delve into it.', 'image.png': 'unsupported',
   });
   const data = await invoke(root, ['.']);
   assert.deepEqual(data.documents.map((item) => item.path), ['docs/keep.md', 'good.txt']);
   assert.ok(data.skipped.some((item) => item.path === 'ignored' && item.directory));
   assert.ok(data.skipped.some((item) => item.path === 'vendor'));
   const included = await invoke(root, ['--include', '**/*.txt', '.']);
   assert.deepEqual(included.documents.map((item) => item.path), ['good.txt']);
   const bypass = await invoke(root, ['--no-ignore', '--exclude', 'a.tmp.md', '.']);
   assert.equal(bypass.options.noIgnore, true);
   assert.ok(bypass.documents.some((item) => item.path === 'ignored/reinclude.md'));
   assert.ok(!bypass.documents.some((item) => item.path === 'vendor/a.md'));
});

test('explicit paths honor ignored parents, avoid symlinks, and cannot leave the project', async (t) => {
   const root = await workspace(t, { '.gitignore': 'ignored/\n', 'ignored/a.md': 'We delve into it.', 'good/a.md': 'Maya approved it.' });
   await symlink(join(root, 'good'), join(root, 'linked'));
   const ignored = await invoke(root, ['ignored/a.md']);
   assert.equal(ignored.documents.length, 0);
   assert.equal(ignored.exitCode, 2);
   const linked = await invoke(root, ['linked/a.md']);
   assert.equal(linked.documents.length, 0);
   assert.match(linked.skipped[0].reason, /Symbolic/);
   const outside = await invoke(root, ['../outside.md']);
   assert.equal(outside.exitCode, 2);
   assert.match(outside.errors[0].message, /inside the project/);
});

test('batch errors preserve successful reports and never alter files', async (t) => {
   const root = await workspace(t, { 'a.md': 'We delve into it.', 'bad.txt': Buffer.from([0xc3, 0x28]), 'binary.txt': Buffer.from([0, 1, 2]) });
   const before = await readFile(join(root, 'a.md'));
   const result = await invoke(root, ['a.md', 'bad.txt', 'binary.txt', 'missing.md']);
   assert.equal(result.exitCode, 2);
   assert.equal(result.documents.length, 1);
   assert.equal(result.errors.length, 2);
   assert.equal(result.skipped.length, 1);
   assert.deepEqual(await readFile(join(root, 'a.md')), before);
});

test('one-file selections preserve coordinates, and invalid selection boundaries fail', async (t) => {
   const root = await workspace(t, { 'a.md': '😀 We delve into it.\nWe delve into it.' });
   const result = await invoke(root, ['--range', '20:37', 'a.md']);
   assert.equal(result.exitCode, 1);
   assert.deepEqual(result.documents[0].report.findings[0].span.startLocation, { line: 2, column: 4 });
   assert.equal(result.documents[0].report.findings.filter((item) => item.ruleId === 'LEX-01').length, 1);
   assert.equal((await invoke(root, ['--range', '1:5', 'a.md'])).exitCode, 2);
   assert.equal((await invoke(root, ['--range', '0:5', '.'])).exitCode, 2);
});

test('stdin paths apply exclusions and path profiles without reading unrelated files', async (t) => {
   const root = await workspace(t, { '.phb.json': { version: 1, overrides: [{ files: ['docs/**'], settings: { forbiddenPhrases: ['special term'] } }] } });
   const result = await invoke(root, ['--stdin-path', 'docs/a.md', '-'], 'special term');
   assert.equal(result.exitCode, 1);
   assert.equal(result.documents[0].path, 'docs/a.md');
   assert.equal((await invoke(root, ['--stdin-path', 'vendor/a.md', '-'], 'special term')).documents.length, 0);
});

test('invalid inputs and configuration fail even when nothing matches', async (t) => {
   const root = await workspace(t);
   for (const args of [[], ['--include', '!invalid/**', '.'], ['--require', 'FAKE-01', '-'],
      ['--threshold', 'fake', '-'], ['--profile', 'missing', '.'], ['--unknown', '-'],
      ['--input-format', 'mdx', '-'], ['--stdin-path', 'a.md', '.'], ['-', '-']]) {
      const result = await invoke(root, args, 'text');
      assert.equal(result.exitCode, 2, JSON.stringify(args));
      assert.ok(result.errors.length);
   }
   await writeFile(join(root, '.phb.json'), '{"version":1,"typo":true}');
   assert.equal((await invoke(root, ['.'])).exitCode, 2);
});

test('CLI entry point returns actual process codes and text output discloses candidates', async (t) => {
   const root = await workspace(t);
   const bin = fileURLToPath(new URL('../../bin/phb.mjs', import.meta.url));
   for (const [input, code] of [['Maya approved it.', 0], ['We delve into it.', 1], ['An “unclosed quote.', 2]]) {
      const result = spawnSync(process.execPath, [bin, 'check', '-'], { cwd: root, input, encoding: 'utf8' });
      assert.equal(result.status, code, result.stderr);
      assert.match(result.stdout, /full coverage partial/);
   }
   const result = spawnSync(process.execPath, [bin, 'check', '-'], { cwd: root, input: 'Maya quietly finished.', encoding: 'utf8' });
   assert.match(result.stdout, /GRAM-01 \[candidate\]/);
   assert.match(result.stdout, /No editorial compliance claim/);
});
