import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ContractError } from '../contracts/validate.mjs';
import { validateCleanupPlan } from './clean.mjs';

const sameStat = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'nlink'].every((key) => a[key] === b[key]);
const run = promisify(execFile);
async function snapshot(path) {
   const entry = await lstat(path, { bigint: true });
   if (!entry.isFile() || entry.nlink !== 1n) throw new ContractError('Cleanup application requires a regular file with one hard link');
   const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
   try {
      const before = await file.stat({ bigint: true });
      if (!sameStat(entry, before) || before.size > 2n * 1024n * 1024n) throw new ContractError('File changed or exceeds the input limit');
      const bytes = await file.readFile();
      if (!sameStat(before, await file.stat({ bigint: true })) || BigInt(bytes.length) !== before.size) throw new ContractError('File changed during cleanup validation');
      return { bytes, stat: before };
   } finally { await file.close(); }
}

export async function applyCleanup(path, plan, config, { root, ...options } = {}) {
   const parent = await realpath(dirname(resolve(path)));
   const base = root ? await realpath(root) : parent;
   const fromRoot = relative(base, parent);
   if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) throw new ContractError('Cleanup destination escaped the project root');
   const target = join(parent, basename(path));
   const original = await snapshot(target);
   validateCleanupPlan(original.bytes, plan, config, options);
   if (!plan.cleanup.edits.length) return false;
   if (!['darwin', 'linux'].includes(process.platform)) throw new ContractError('Cleanup application currently requires the macOS or Linux metadata-preserving file writer');
   const temporary = join(parent, `.phb-${randomUUID()}.tmp`);
   let created = false;
   try {
      const file = await open(temporary, 'wx', 0o600);
      created = true;
      try {
         // Start from a metadata-preserving copy so replacing text does not drop
         // existing ACLs, extended attributes, or resource forks on macOS.
         await run('/bin/cp', process.platform === 'darwin' ? ['-p', target, temporary] : ['--preserve=all', '--', target, temporary]);
         const copied = await file.stat({ bigint: true });
         if (copied.uid !== original.stat.uid || copied.gid !== original.stat.gid || copied.mode !== original.stat.mode) throw new ContractError('Could not preserve file ownership and permissions');
         await file.truncate(0);
         await file.writeFile(plan.cleanup.outputText, 'utf8');
         await file.chmod(Number(original.stat.mode & 0o7777n));
         await file.sync();
      } finally { await file.close(); }
      // Best-effort optimistic concurrency: recheck bytes and identity just before
      // atomic replacement. An external writer can still race the final rename.
      const current = await snapshot(target);
      if (!sameStat(original.stat, current.stat) || !original.bytes.equals(current.bytes)) throw new ContractError('File changed before cleanup application');
      await rename(temporary, target);
      created = false;
      return true;
   } finally {
      if (created) await unlink(temporary);
   }
}
