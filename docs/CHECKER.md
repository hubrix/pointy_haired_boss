# Local checker

`phb check` reads English UTF-8 text and Markdown, reports exact phrase/terminology violations, and produces candidates for all four house bans. It never edits files, calls a model, or makes network requests. Contextual review, Unicode inspection/cleanup, readability measurement, checked Chicago rules, and host adapters remain pending in [project.org](../project.org).

## Run it

From this checkout, with Node 22.18 or newer:

```sh
npm ci --include=dev --ignore-scripts
node bin/phb.mjs check draft.md
node bin/phb.mjs check --format json docs/
node bin/phb.mjs check --include '**/*.md' --exclude 'docs/archive/**' docs/
printf '%s\n' 'We delve into the report.' | node bin/phb.mjs check -
node bin/phb.mjs check --help
```

`npm run phb -- check draft.md` also works. The package declares a `phb` executable for later distribution; these instructions do not install it globally. The parser and grammar checker are runtime dependencies; textlint remains a development dependency for the comparison spike.

An explicit target is required. `-` reads stdin. Targets resolve against `--root DIR`, which defaults to the working directory, and must stay within it. Config/profile file arguments resolve against the working directory. Discovery deduplicates overlapping targets and accepts `.md`, `.markdown`, and `.txt`, case-insensitively. `--input-format markdown|text` overrides that filter and controls stdin parsing. Plain text keeps literal Markdown characters.

Scans honor positive include/exclude globs, configured exclusions, and nested `.gitignore` rules with negation. Ignore handling uses [node-ignore](https://github.com/kaelzhang/node-ignore). Ignored parent directories remain pruned. Explicit files also honor these rules. `--no-ignore` bypasses `.gitignore` and records that override; configured exclusions still apply. Global Git excludes and `.git/info/exclude` are not loaded. Skipped directory counts count the pruned entry, not its contents. Symlinks and special filesystem objects are skipped.

`--stdin-path docs/draft.md` supplies a logical path for configuration and include/exclude filtering without loading that file or its ignore chain. Without it, stdin has no path overrides. NUL-bearing input is reported as binary and skipped; invalid UTF-8 is an error. Each input has a 2 MiB limit. A run with no eligible inputs returns `2`. Batch failures retain successful reports and produce exit `2`.

## Configuration and selections

The checker loads `.phb.json` from the chosen root if present. Use `--user-config FILE` for explicit user settings and `--config FILE` for invocation settings. No home-directory defaults or profile directories are searched yet. Repeat `--profile-file FILE` to load named profiles; select one with `--profile NAME` or a config selector. The [version 1 contracts](CONTRACTS.md) define precedence and strict validation, including inactive overrides.

The house profile bans nine exact phrases: `delve into`, `in today's fast-paced world`, `it is worth noting`, `it's worth noting`, `ever-evolving landscape`, `a rich tapestry`, `unlock the full potential`, `a testament to`, and `in the realm of`. These are configurable preferences, not evidence of AI authorship. `forbiddenPhrases` replaces the array. `allowedTerms` exempts whole lexical matches, including projected formatting/entities; it does not disable grammar checks. Required terminology uses the same matching policy and LEX-01 findings, with no automatic replacement.

`--range START:END` restricts findings to one explicit file or stdin selection: zero-based, half-open UTF-16 positions in the original input. Surrogate pairs and CRLF cannot be split. Matching keeps surrounding prose context so a selection cannot create a word boundary or hide an enclosing allowed term. Only findings fully inside the selection appear. Reports include the selection and hash the full original input. Boundary problems elsewhere in that input remain visible.

An explicit `check` request runs regardless of the automatic activation setting. That setting will govern host automation when adapters exist; this CLI does not simulate a host session.

## Protected content and source mapping

The remark parser protects code, block quotations, front matter, math, raw HTML, images, link destinations, definitions, and footnotes. Ordinary link labels remain prose. A block containing inline HTML is protected as a whole. JSON includes protected intervals/reasons; text output gives their count. This policy favors preservation over coverage inside HTML.

Within prose, the parser protects paired straight/curly quotations, nested quotes, author-date/year-bearing parentheticals, Pandoc citation brackets, numeric citation brackets/references, URLs, and email addresses. Word-internal apostrophes stay in prose. Year-bearing parentheticals are protected even when they are not citations. Unclosed opening quotes protect the remaining block and make boundary coverage partial. Unusual quotation/citation conventions may need a trusted lock; these patterns do not claim universal citation recognition.

The parser joins supported inline formatting within a block. Decoded characters map back to exact original intervals, including escapes, multi-character entities, emoji, CRLF, and list-continuation indentation. A finding across formatting may include Markdown delimiters in its source excerpt. It never carries an automatic patch. Protected content and block boundaries interrupt phrase matching. Horizontal whitespace matching does not cross line breaks.

Unknown AST nodes and unmappable text are protected and make boundary coverage partial, yielding exit `2`. Supported protection counts as completed boundary handling, not a style review of the protected content.

## Trusted locks and suppressions

Pass `--trusted-directives` when you intend to honor a document's lint comments. Otherwise, comments remain protected HTML and do not affect surrounding prose. Directives must be standalone root-level HTML comments; examples inside code, quotations, lists, or inline HTML cannot change policy. The parser treats them as fixed data and never executes them as instructions.

```markdown
<!-- phb:lock {"reason":"Keep the approved excerpt exact"} -->

This passage is protected.

<!-- phb:unlock -->

<!-- phb:suppress {"ruleIds":["LEX-01"],"reason":"Approved tagline"} -->

We delve into the report.

<!-- phb:resume -->
```

Use one balanced pair at a time; pairs cannot nest. Opening directives need a nonblank reason. Unknown/malformed directives, unmatched pairs, invalid rule IDs, and fidelity-rule suppressions return `2`. A suppression must contain the whole finding. Suppressed findings retain their reason. Locks remove content from prose checking while retaining its protected interval.

## Findings, coverage, and exits

LEX-01 uses literal Unicode-aware matching on eligible projected prose. The grammar pipeline uses compromise and targeted patterns for negation, passive infinitives/reduced clauses, staged contrasts, and missing-owner duties. Context must confirm grammatical role, rhetorical purpose, and responsibility. All four house-ban checks remain partial even when no candidates appear. Candidates retain the house rule's error level but display as warnings pending review. Negation findings require preserving the negative claim; duty findings require a supported actor. No replacement invents one.

Text output includes positions, rule IDs, status, reasons, excerpts, required/omitted checks, and coverage. JSON returns a versioned batch envelope with `documents`, `skipped`, `errors`, `options`, and `exitCode`. Each document includes a validated [report](../schemas/report.schema.json), profile/override names, selection, and boundary data. The envelope is a development CLI format; each report has the published version 1 schema.

| Exit | Meaning |
| --- | --- |
| `0` | Required local checks completed without a confirmed/conflict finding at the threshold |
| `1` | A confirmed/conflict finding meets the threshold |
| `2` | Invalid input/configuration, operational failure, no eligible inputs, or incomplete required coverage |

This development command requires **boundaries and LEX-01** by default. Every omitted rule remains visible; exit `0` never certifies editorial compliance. Unicode checks join the default scope when PHB-022 implements them. `--require LEX-01,GRAM-01` selects required rule IDs, with boundaries always required. Requiring a contextual/unimplemented check returns `2`; a disabled/unknown rule is an error. `--threshold error|warning|suggestion` applies to confirmed findings and conflicts, not candidates. Incomplete required coverage takes precedence over violation exit `1`.

## Verification limits

Tests cover original positions, structural boundaries, 16 parser-spike fixtures, the 20 small labeled grammar examples, terminology/allowlists, directives, selections, config precedence, ignores/symlinks, batch failures, and process exits. The grammar examples establish candidate behavior on those fixtures, not real-world precision or recall. The larger frozen corpus, host lifecycle tests, exact minimum Node version, and performance/privacy release gates remain in the tracker.
