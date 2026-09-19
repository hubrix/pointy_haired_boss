import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, chmod, stat, realpath, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { runCli } from '../../src/check/cli.mjs';
import { planCleanup } from '../../src/unicode/clean.mjs';
import { applyCleanup } from '../../src/unicode/write.mjs';
import { resolveConfig } from '../../src/contracts/config.mjs';

async function workspace(t, files = {}) {
   const root = await realpath(await mkdtemp(join(tmpdir(), 'phb-unicode-')));
   t.after(() => rm(root, { recursive: true, force: true }));
   for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content);
   return root;
}
async function invoke(root, args, input = '') {
   let output = '';
   const exitCode = await runCli(['clean', '--format', 'json', ...args], {
      cwd: root, stdin: Readable.from([input]), stdout: { write: (text) => { output += text; } },
   });
   const result = JSON.parse(output);
   assert.equal(result.exitCode, exitCode);
   return result;
}
const settings = () => resolveConfig({ invocation: { version: 1, unicode: { remove: ['U+200B'] } } }).config;

test('cleanup preview reports exact edits and output without touching files', async (t) => {
   const input = '\uFEFFre\u200Bport\r\n';
   const root = await workspace(t, { 'draft.md': input });
   const before = await stat(join(root, 'draft.md'));
   const result = await invoke(root, ['--remove', 'U+200B', 'draft.md']);
   const cleanup = result.documents[0].cleanup;
   assert.equal(result.operation, 'clean');
   assert.equal(result.exitCode, 1);
   assert.equal(cleanup.outputText, 'report\r\n');
   assert.equal(cleanup.edits.length, 2);
   assert.equal(cleanup.applied, false);
   assert.equal(await readFile(join(root, 'draft.md'), 'utf8'), input);
   assert.equal((await stat(join(root, 'draft.md'))).mtimeMs, before.mtimeMs);
});

test('explicit application preserves mode/newlines, removes temporary files, and is idempotent', async (t) => {
   const root = await workspace(t, { 'draft.md': '\uFEFFre\u200Bport\r\n👩🏽‍💻\r\n' });
   const path = join(root, 'draft.md');
   await chmod(path, 0o640);
   const args = ['--remove', 'U+200B', '--apply', 'draft.md'];
   const result = await invoke(root, args);
   assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
   assert.equal(result.documents[0].cleanup.applied, true);
   assert.equal(await readFile(path, 'utf8'), 'report\r\n👩🏽‍💻\r\n');
   assert.equal((await stat(path)).mode & 0o777, 0o640);
   assert.deepEqual(await readdir(root), ['draft.md']);
   const before = await stat(path);
   const again = await invoke(root, args);
   assert.equal(again.exitCode, 0);
   assert.equal(again.documents[0].cleanup.edits.length, 0);
   assert.equal(again.documents[0].cleanup.applied, false);
   assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
});

test('remaining ambiguous characters stay intact and retain a nonzero cleanup result', async (t) => {
   const root = await workspace(t, { 'draft.txt': '\uFEFFre\u200Bport' });
   const result = await invoke(root, ['--apply', 'draft.txt']);
   assert.equal(result.exitCode, 1);
   assert.equal(result.documents[0].cleanup.applied, true);
   assert.equal(result.documents[0].cleanup.remaining, 1);
   assert.equal(await readFile(join(root, 'draft.txt'), 'utf8'), 're\u200Bport');
});

test('macOS file replacement preserves extended attributes and ACL entries', { skip: process.platform !== 'darwin' }, async (t) => {
   const root = await workspace(t, { 'draft.txt': '\uFEFFtext' });
   const path = join(root, 'draft.txt');
   const attribute = spawnSync('/usr/bin/xattr', ['-w', 'org.phb.test', 'keep-this-value', path], { encoding: 'utf8' });
   assert.equal(attribute.status, 0, attribute.stderr);
   const acl = spawnSync('/bin/chmod', ['+a', 'everyone allow readattr', path], { encoding: 'utf8' });
   assert.equal(acl.status, 0, acl.stderr);
   const before = spawnSync('/bin/ls', ['-le', path], { encoding: 'utf8' }).stdout.split('\n').slice(1);
   const result = await invoke(root, ['--apply', 'draft.txt']);
   assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
   assert.equal(spawnSync('/usr/bin/xattr', ['-p', 'org.phb.test', path], { encoding: 'utf8' }).stdout.trim(), 'keep-this-value');
   assert.deepEqual(spawnSync('/bin/ls', ['-le', path], { encoding: 'utf8' }).stdout.split('\n').slice(1), before);
});

test('stale source, forged edits, and policy changes leave original files intact', async (t) => {
   const input = '\uFEFFre\u200Bport';
   const root = await workspace(t, { 'draft.txt': input });
   const path = join(root, 'draft.txt');
   const options = { root, path: 'draft.txt', format: 'text' };
   const plan = planCleanup(input, settings(), options);
   await writeFile(path, `${input}!`);
   await assert.rejects(applyCleanup(path, plan, settings(), options), /stale/);
   assert.equal(await readFile(path, 'utf8'), `${input}!`);
   await writeFile(path, input);
   const forged = structuredClone(plan);
   forged.cleanup.outputText = 'invented prose';
   await assert.rejects(applyCleanup(path, forged, settings(), options), /stale/);
   await assert.rejects(applyCleanup(path, plan, resolveConfig().config, options), /stale/);
   assert.equal(await readFile(path, 'utf8'), input);
   assert.deepEqual(await readdir(root), ['draft.txt']);
});

test('application refuses symlinks, hard links, and destinations outside the root', async (t) => {
   const input = '\uFEFFtext';
   const root = await workspace(t, { 'draft.txt': input });
   const other = await workspace(t, { 'outside.txt': input });
   const config = settings();
   const plan = planCleanup(input, config);
   await symlink(join(root, 'draft.txt'), join(root, 'symbolic.txt'));
   await assert.rejects(applyCleanup(join(root, 'symbolic.txt'), plan, config, { root }), /regular file/);
   await link(join(root, 'draft.txt'), join(root, 'hard.txt'));
   await assert.rejects(applyCleanup(join(root, 'draft.txt'), plan, config, { root }), /hard link/);
   await assert.rejects(applyCleanup(join(other, 'outside.txt'), plan, config, { root }), /escaped/);
   assert.equal(await readFile(join(root, 'draft.txt'), 'utf8'), input);
});

test('batch application reports per-file success and failure without pretending to be a transaction', async (t) => {
   const root = await workspace(t, { 'good.txt': '\uFEFFtext', 'bad.txt': Buffer.from([0xc3, 0x28]) });
   const result = await invoke(root, ['--apply', 'good.txt', 'bad.txt']);
   assert.equal(result.exitCode, 2);
   assert.equal(result.documents[0].cleanup.applied, true);
   assert.equal(result.errors.length, 1);
   assert.equal(await readFile(join(root, 'good.txt'), 'utf8'), 'text');
   assert.deepEqual(await readFile(join(root, 'bad.txt')), Buffer.from([0xc3, 0x28]));
});

test('stdin previews, selections, and BOM preservation follow explicit options', async (t) => {
   const root = await workspace(t, { 'draft.txt': 're\u200Bport re\u200Bport' });
   const preview = await invoke(root, ['--remove', 'U+200B', '-'], '\uFEFFre\u200Bport');
   assert.equal(preview.documents[0].cleanup.outputText, 'report');
   const preserved = await invoke(root, ['--preserve-bom', '-'], '\uFEFFtext');
   assert.equal(preserved.exitCode, 0);
   assert.equal(preserved.documents[0].cleanup.outputText, '\uFEFFtext');
   const selected = await invoke(root, ['--range', '8:15', '--remove', 'U+200B', '--apply', 'draft.txt']);
   assert.equal(selected.exitCode, 0);
   assert.equal(await readFile(join(root, 'draft.txt'), 'utf8'), 're\u200Bport report');
});

test('JSON output escapes format controls while preserving their exact parsed values', async (t) => {
   const root = await workspace(t);
   let output = '';
   const input = 'a\u202Eb\u{E0061}';
   await runCli(['clean', '--format', 'json', '-'], { cwd: root, stdin: Readable.from([input]),
      stdout: { write: (text) => { output += text; } } });
   assert.doesNotMatch(output, /[\u202E\u{E0061}]/u);
   assert.match(output, /\\u202e/);
   assert.equal(JSON.parse(output).documents[0].cleanup.outputText, input);
});

test('bad options and incomplete boundary/required coverage never authorize writes', async (t) => {
   const input = '\uFEFFAn “unclosed quote.';
   const root = await workspace(t, { 'draft.txt': input });
   for (const args of [['--apply', '-'], ['--remove', 'U+200D', 'draft.txt'], ['--require', 'LEX-01', '--apply', 'draft.txt'], ['--apply', 'draft.txt']]) {
      const result = await invoke(root, args, input);
      assert.equal(result.exitCode, 2, JSON.stringify(args));
      assert.equal(await readFile(join(root, 'draft.txt'), 'utf8'), input);
   }
   let output = '';
   assert.equal(await runCli(['check', '--apply', 'draft.txt'], { cwd: root, stdout: { write: (text) => { output += text; } } }), 2);
   assert.match(output, /only by phb clean/);
});

test('check and clean execute with Node networking APIs disabled and render invisible characters visibly', async (t) => {
   const root = await workspace(t, { 'no-network.mjs': `
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const deny = () => { throw new Error('Network disabled for this test'); };
net.Socket.prototype.connect = deny;
http.request = deny; http.get = deny; https.request = deny; https.get = deny;
globalThis.fetch = deny;
` });
   const bin = fileURLToPath(new URL('../../bin/phb.mjs', import.meta.url));
   for (const command of ['check', 'clean']) {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'no-network.mjs')).href,
         bin, command, '--remove', 'U+200B', '-'], { cwd: root, input: '\uFEFFre\u200Bport\u202E', encoding: 'utf8' });
      assert.equal(result.status, command === 'check' ? 0 : 1, result.stderr);
      assert.match(result.stdout, /U\+200B ZERO WIDTH SPACE/);
      assert.match(result.stdout, /U\+202E RIGHT-TO-LEFT OVERRIDE/);
      assert.doesNotMatch(result.stdout, /[\u200B\u202E\uFEFF]/);
   }
});
