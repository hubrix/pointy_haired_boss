import { lstat, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';
import { matchesPath, normalizePath } from '../contracts/config.mjs';
import { ContractError } from '../contracts/validate.mjs';

export const inputFormat = (path) => ({ '.md': 'markdown', '.markdown': 'markdown', '.txt': 'text' })[extname(path).toLowerCase()];

export async function optionalFile(path) {
   try { return await readFile(path, 'utf8'); }
   catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

export async function collectInputs(targets, { root, resolveForPath, include = [], exclude = [], noIgnore = false, format } = {}) {
   // Validate patterns even when the input set is empty or every file is ignored.
   matchesPath('validation.txt', [...include, ...exclude]);
   const files = [];
   const skipped = [];
   const errors = [];
   const visited = new Set();
   const ignoreCache = new Map();
   async function rulesAt(dir) {
      if (!ignoreCache.has(dir)) {
         const text = noIgnore ? undefined : await optionalFile(join(root, dir, '.gitignore'));
         ignoreCache.set(dir, text === undefined ? null : ignore().add(text));
      }
      return ignoreCache.get(dir);
   }
   async function ignored(path, directory) {
      if (noIgnore) return false;
      let ignored = false;
      let dir = '';
      const parts = path.split('/');
      for (let index = 0; index < parts.length; index++) {
         const rules = await rulesAt(dir);
         const local = parts.slice(index).join('/') + (directory ? '/' : '');
         const result = rules?.test(local);
         if (result?.ignored) ignored = true;
         if (result?.unignored) ignored = false;
         dir = parts.slice(0, index + 1).join('/');
      }
      return ignored;
   }
   function skip(path, reason, directory = false) { skipped.push({ path, reason, directory }); }
   async function permitted(path, info) {
      if (info.isSymbolicLink()) { skip(path, 'Symbolic links are not followed.'); return false; }
      if (!info.isFile() && !info.isDirectory()) { skip(path, 'Unsupported filesystem object.'); return false; }
      const effective = resolveForPath(path);
      if (effective.excluded || matchesPath(path, exclude)) { skip(path, 'Excluded by configuration or --exclude.', info.isDirectory()); return false; }
      if (await ignored(path, info.isDirectory())) { skip(path, 'Ignored by .gitignore.', info.isDirectory()); return false; }
      return true;
   }
   async function walk(path) {
      if (visited.has(path)) return;
      visited.add(path);
      const full = join(root, path);
      const info = await lstat(full);
      if (path && !await permitted(path, info)) return;
      if (info.isDirectory()) {
         for (const name of (await readdir(full)).sort()) {
            const child = path ? `${path}/${name}` : name;
            try { await walk(child); } catch (error) { errors.push({ path: child, message: error.message }); }
         }
      } else if (!format && !inputFormat(path)) skip(path, 'Unsupported extension; use --input-format for an explicit format.');
      else if (include.length && !matchesPath(path, include)) skip(path, 'Does not match --include.');
      else files.push({ path, full, format: format ?? inputFormat(path), size: info.size });
   }
   for (const target of targets) {
      try {
         const absolute = resolve(root, target);
         const path = relative(root, absolute).split(sep).join('/');
         if (path) normalizePath(path);
         // Check each ancestor for ignored directories or symlinks even when the
         // caller supplies a deep explicit file path rather than its parent.
         const parts = path.split('/');
         let allowed = true;
         for (let index = 1; index < parts.length; index++) {
            const parent = parts.slice(0, index).join('/');
            if (!await permitted(parent, await lstat(join(root, parent)))) { allowed = false; break; }
         }
         if (allowed) await walk(path);
      } catch (error) { errors.push({ path: target, message: error.message }); }
   }
   return { files, skipped, errors };
}

export function selectionRange(value) {
   const match = /^(\d+):(\d+)$/.exec(value);
   if (!match) throw new ContractError('--range must be START:END in zero-based UTF-16 offsets');
   const start = Number(match[1]);
   const end = Number(match[2]);
   if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) throw new ContractError('Selection must be a nonempty safe-integer range');
   return { start, end };
}
