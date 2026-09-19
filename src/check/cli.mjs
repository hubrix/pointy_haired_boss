import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseConfig, resolveConfig, normalizePath, matchesPath } from '../contracts/config.mjs';
import { createSource } from '../contracts/source.mjs';
import { ruleIds } from '../contracts/catalog.mjs';
import { ContractError, validate } from '../contracts/validate.mjs';
import { checkProse } from './check.mjs';
import { collectInputs, inputFormat, optionalFile, selectionRange } from './inputs.mjs';
import { planCleanup } from '../unicode/clean.mjs';
import { applyCleanup } from '../unicode/write.mjs';
import { visibleText } from '../unicode/inventory.mjs';

const maxBytes = 2 * 1024 * 1024;
const help = `Usage: phb check|clean [options] FILE|DIRECTORY|-

Local prose checks and Unicode cleanup previews. '-' reads UTF-8 stdin.
check requires boundaries, LEX-01, and UNI-01–06. clean requires boundaries and
UNI-01–06. check also reports reading grade and a limited Chicago review subset.
House-ban and Chicago candidates need editorial review. Host adapters remain
pending. clean writes files only with --apply.

  --root DIR                 Project root (default: current directory)
  --format text|json         Output format (default: text)
  --input-format markdown|text  Override input format (stdin defaults to Markdown)
  --stdin-path PATH          Relative path for stdin profiles/exclusions
  --config FILE             Invocation configuration JSON
  --user-config FILE        Explicit user configuration JSON
  --profile-file FILE       Named profile JSON; repeatable
  --profile NAME            Select a loaded profile
  --include GLOB            Include paths; repeatable positive POSIX globs
  --exclude GLOB            Exclude additional paths; repeatable
  --no-ignore               Bypass .gitignore; recorded in output
  --range START:END         Check one source selection (UTF-16, half-open)
  --trusted-directives      Honor standalone root-level phb comments
  --remove CODEPOINT        Opt in to ASCII-word artifact removal; repeatable
                            U+200B, U+00AD, U+2060, or U+FEFF
  --preserve-bom            Keep initial UTF-8 signatures during cleanup
  --apply                   Apply clean edits to files (never stdin)
  --require RULE,RULE       Require coverage for these enabled rule IDs
  --threshold LEVEL         error, warning, or suggestion (check: error;
                            clean: suggestion)
  --help                    Show this help

Loads .phb.json at the project root if present. Directory walks honor nested
.gitignore files, exclusions, and .md/.markdown/.txt extensions. Symlinks are skipped.
Exit 0: requested local scope passed; 1: violation; 2: failure/incomplete coverage.
Exit 0 never certifies editorial compliance. Inputs are limited to 2 MiB each.
clean previews return 1 for proposed edits; applied runs use the output report.
`;

const optionTypes = {
   root: { type: 'string' }, format: { type: 'string' }, 'input-format': { type: 'string' },
   'stdin-path': { type: 'string' }, config: { type: 'string' }, 'user-config': { type: 'string' },
   'profile-file': { type: 'string', multiple: true }, profile: { type: 'string' },
   include: { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true },
   'no-ignore': { type: 'boolean' }, range: { type: 'string' },
   'trusted-directives': { type: 'boolean' }, require: { type: 'string' },
   threshold: { type: 'string' }, help: { type: 'boolean' },
   remove: { type: 'string', multiple: true }, 'preserve-bom': { type: 'boolean' }, apply: { type: 'boolean' },
};
const safeLine = (text) => visibleText(String(text)).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
   (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function textOutput(batch) {
   const lines = [];
   if (batch.options?.noIgnore) lines.push('Override: .gitignore rules bypassed by --no-ignore.');
   for (const item of batch.documents) {
      const { report } = item;
      lines.push(`${safeLine(item.path)}: required local coverage ${report.requestedCoverage}; full coverage ${report.coverage}; exit ${item.cleanup?.exitCode ?? report.exitCode}`);
      lines.push(`  Required checks: ${report.checks.filter((check) => check.required).map((check) => check.id).join(', ')}`);
      if (item.cleanup?.applied) lines.push('  Findings and positions below refer to the original source, before cleanup.');
      if (item.selection) lines.push(`  Selection: UTF-16 ${item.selection.start}:${item.selection.end}`);
      for (const finding of report.findings) {
         const { line, column } = finding.span.startLocation;
         lines.push(`  ${line}:${column} ${finding.severity} ${finding.ruleId} [${finding.status}] ${safeLine(finding.reason)}`);
         lines.push(`    ${safeLine(JSON.stringify(finding.span.text))}`);
         if (finding.exemption) lines.push(`    Exemption: ${safeLine(finding.exemption.reason)}`);
      }
      const partial = report.checks.filter((check) => check.status === 'partial' || check.status === 'failed');
      for (const check of partial) lines.push(`  ${check.id}: ${safeLine(check.reason)}`);
      lines.push(`  Skipped checks: ${report.checks.filter((check) => check.status === 'skipped').map((check) => check.id).join(', ') || 'none'}`);
      lines.push(`  Protected ranges: ${item.boundaries.protectedSpans.length}. No editorial compliance claim.`);
      if (item.readability) {
         const metric = item.readability;
         lines.push(`  Readability: ${metric.status}; ${metric.words} words, ${metric.sentences} sentences; ` +
            (metric.grade === null ? 'grade unavailable.' : `estimated grade ${metric.grade.toFixed(2)}; target at most ${metric.targetMaxGrade}.`));
         lines.push(`    ${safeLine(metric.reason)}`);
         lines.push(`    Excluded: ${Object.entries(metric.excluded).map(([reason, count]) => `${reason}=${count}`).join(', ')}.`);
         for (const token of metric.unsupportedTokens) lines.push(`    Undefined pronunciation at ${token.span.startLocation.line}:${token.span.startLocation.column}: ${safeLine(token.span.text)}`);
      }
      if (item.chicago) lines.push(`  Chicago: ${item.chicago.rules.filter((rule) => rule.status !== 'disabled').length} narrow candidate checks; source editions recorded in docs/STYLE.md and JSON. Wider guidance requires review.`);
      if (item.unicode) {
         lines.push(`  Unicode ${item.unicode.unicodeVersion}: ${item.unicode.items.length} inventoried characters. No statistical-watermark test.`);
         for (const entry of item.unicode.items) {
            lines.push(`    ${entry.span.startLocation.line}:${entry.span.startLocation.column} ${entry.codePoint} ${entry.name} [${entry.action}; ${entry.scope}; ${entry.certainty}] ${safeLine(entry.reason)}`);
            lines.push(`      ${safeLine(entry.context.before)}<${entry.codePoint}>${safeLine(entry.context.after)}`);
         }
      }
      if (item.cleanup) {
         lines.push(`  Cleanup ${item.cleanup.applied ? 'applied' : 'preview'}: ${item.cleanup.edits.length} edits; ${item.cleanup.remaining} review items remain; exit ${item.cleanup.exitCode}.`);
         for (const edit of item.cleanup.edits) lines.push(`    Delete ${visibleText(edit.original)} at UTF-16 ${edit.range.start}:${edit.range.end}. ${safeLine(edit.reason)}`);
      }
   }
   for (const item of batch.skipped) lines.push(`Skipped ${safeLine(item.path)}: ${safeLine(item.reason)}`);
   for (const item of batch.errors) lines.push(`Error ${safeLine(item.path)}: ${safeLine(item.message)}`);
   lines.push(`Checked ${batch.documents.length}; skipped ${batch.skipped.length} entries; errors ${batch.errors.length}; exit ${batch.exitCode}.`);
   return lines.join('\n') + '\n';
}

export async function runCli(args, { cwd = process.cwd(), stdin = process.stdin, stdout = process.stdout } = {}) {
   let outputFormat = args.includes('--format=json') || args.some((arg, i) => arg === '--format' && args[i + 1] === 'json') ? 'json' : 'text';
   const batch = { version: 1, scope: 'local', documents: [], skipped: [], errors: [], exitCode: 2 };
   try {
      if (args.length === 1 && args[0] === '--help') { stdout.write(help); return 0; }
      const command = args[0];
      if (!['check', 'clean'].includes(command)) throw new ContractError('Use phb check or phb clean; other commands are not implemented.');
      const { values, positionals } = parseArgs({ args: args.slice(1), options: optionTypes, allowPositionals: true, strict: true });
      if (values.help) { stdout.write(help); return 0; }
      batch.operation = command;
      outputFormat = values.format ?? 'text';
      if (!['text', 'json'].includes(outputFormat)) throw new ContractError('--format must be text or json');
      if (values['input-format'] && !['markdown', 'text'].includes(values['input-format'])) throw new ContractError('--input-format must be markdown or text');
      if (values.threshold && !['error', 'warning', 'suggestion'].includes(values.threshold)) throw new ContractError('Unknown threshold');
      if (!positionals.length) throw new ContractError('Provide an explicit file, directory, or - for stdin.');
      if (values.apply && command !== 'clean') throw new ContractError('--apply is supported only by phb clean');
      if (values.apply && positionals.includes('-')) throw new ContractError('--apply requires file targets; stdin cleanup is a preview');
      if (positionals.filter((path) => path === '-').length > 1) throw new ContractError('stdin can be read only once');
      if (values['stdin-path'] && !positionals.includes('-')) throw new ContractError('--stdin-path requires -');
      const stdinPath = values['stdin-path'] ? normalizePath(values['stdin-path']) : null;
      const selection = values.range ? selectionRange(values.range) : undefined;
      if (selection && positionals.length !== 1) throw new ContractError('--range requires exactly one file or stdin target');
      const requestedChecks = values.require === undefined ? undefined : values.require.split(',');
      if (requestedChecks?.some((id) => !ruleIds.includes(id))) throw new ContractError('--require contains an unknown or empty rule ID');
      const root = await realpath(resolve(cwd, values.root ?? '.'));
      const readConfig = async (path) => path ? parseConfig(await readFile(resolve(cwd, path), 'utf8')) : { version: 1 };
      const user = await readConfig(values['user-config']);
      const projectText = await optionalFile(resolve(root, '.phb.json'));
      const project = projectText === undefined ? { version: 1 } : parseConfig(projectText);
      const invocation = await readConfig(values.config);
      if (values.profile !== undefined) invocation.profile = values.profile;
      if (values.remove || values['preserve-bom']) invocation.unicode = { ...invocation.unicode,
         ...(values.remove ? { remove: values.remove } : {}), ...(values['preserve-bom'] ? { bom: 'preserve' } : {}) };
      const profiles = [];
      for (const path of values['profile-file'] ?? []) {
         let profile;
         try { profile = JSON.parse(await readFile(resolve(cwd, path), 'utf8')); }
         catch (error) { throw new ContractError(`Cannot load profile ${path}: ${error.message}`); }
         profiles.push(validate('profile', profile));
      }
      const resolveForPath = (path) => resolveConfig({ user, project, invocation, profiles, path });
      resolveForPath(); // Validate every layer before discovery, including empty directories.
      matchesPath('validation.txt', [...values.include ?? [], ...values.exclude ?? []]);
      batch.options = { root, include: values.include ?? [], exclude: values.exclude ?? [],
         noIgnore: values['no-ignore'] ?? false, trustedDirectives: values['trusted-directives'] ?? false,
         apply: values.apply ?? false };
      const inputs = await collectInputs(positionals.filter((path) => path !== '-'), { root, resolveForPath,
         include: values.include, exclude: values.exclude, noIgnore: values['no-ignore'], format: values['input-format'] });
      batch.skipped.push(...inputs.skipped);
      batch.errors.push(...inputs.errors);
      if (selection && !positionals.includes('-') && (inputs.files.length !== 1 ||
          resolve(root, positionals[0]) !== inputs.files[0].full)) throw new ContractError('--range requires one explicit supported file');
      async function check(input, path, format, file) {
         try {
            if (input.length > maxBytes) throw new ContractError('Input exceeds the 2 MiB limit; split it into smaller inputs.');
            if (input.includes(0)) { batch.skipped.push({ path: path ?? '<stdin>', reason: 'Binary input contains NUL.', directory: false }); return; }
            // Decode once here to reject malformed UTF-8 before any parser sees it.
            const source = createSource(input);
            const effective = resolveForPath(path);
            const options = { path, format, selection,
               trustedDirectives: values['trusted-directives'] ?? false, requestedChecks, threshold: values.threshold };
            const result = command === 'clean' ? planCleanup(source.text, effective.config, options) : checkProse(source.text, effective.config, options);
            const document = { path: path ?? '<stdin>', profile: effective.config.profile,
               matchedOverrides: effective.matchedOverrides, ...result };
            batch.documents.push(document);
            if (values.apply && result.cleanup.exitCode !== 2) {
               result.cleanup.applied = await applyCleanup(file, result, effective.config, { root, ...options });
               result.cleanup.exitCode = result.cleanup.afterReport.exitCode;
            }
         } catch (error) { batch.errors.push({ path: path ?? '<stdin>', message: error.message }); }
      }
      for (const file of inputs.files) {
         try {
            if (file.size > maxBytes) throw new ContractError('Input exceeds the 2 MiB limit; split it into smaller inputs.');
            await check(await readFile(file.full), file.path, file.format, file.full);
         } catch (error) { batch.errors.push({ path: file.path, message: error.message }); }
      }
      if (positionals.includes('-')) {
         const effective = resolveForPath(stdinPath);
         if (effective.excluded || (stdinPath && matchesPath(stdinPath, values.exclude ?? []))) {
            batch.skipped.push({ path: stdinPath ?? '<stdin>', reason: 'stdin path excluded by configuration or --exclude.', directory: false });
         } else if (stdinPath && values.include?.length && !matchesPath(stdinPath, values.include)) {
            batch.skipped.push({ path: stdinPath, reason: 'stdin path does not match --include.', directory: false });
         } else {
            const chunks = [];
            let bytes = 0;
            for await (const chunk of stdin) {
               const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
               bytes += buffer.length;
               if (bytes > maxBytes) throw new ContractError('stdin exceeds the 2 MiB limit; split it into smaller inputs.');
               chunks.push(buffer);
            }
            await check(Buffer.concat(chunks), stdinPath, values['input-format'] ?? inputFormat(stdinPath ?? '') ?? 'markdown');
         }
      }
      if (!batch.documents.length && !batch.errors.length) batch.errors.push({ path: '<input>', message: 'No eligible prose inputs were checked.' });
      batch.exitCode = batch.errors.length ? 2 : Math.max(0, ...batch.documents.map((item) => item.cleanup?.exitCode ?? item.report.exitCode));
   } catch (error) { batch.errors.push({ path: '<invocation>', message: error.message }); batch.exitCode = 2; }
   // Escape format controls for display without changing the parsed JSON values.
   const json = () => JSON.stringify(batch, null, 2).replace(/[\p{Cf}\p{Zl}\p{Zp}\u{E0000}-\u{E007F}]/gu,
      (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')) + '\n';
   stdout.write(outputFormat === 'json' ? json() : textOutput(batch));
   return batch.exitCode;
}
