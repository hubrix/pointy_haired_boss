# Shared contracts, version 1

PHB-020 implements the data contracts used by the future checker and host adapters. The module APIs live in [src/contracts](../src/contracts/). [JSON Schemas](../schemas/), the [40-record catalog](../rules/catalog.json), and the [house profile](../profiles/house.json) are generated from those definitions. Run `npm run schemas` after changing a definition; `npm test` rejects stale generated files.

This layer validates configuration, source spans, findings, and coverage. It does not yet provide file discovery, Markdown boundary detection, contextual review, or an installable plugin. Catalog membership describes policy; it does not imply an available detector. Chicago entries remain families awaiting source-checked subrules.

## Configuration and profiles

`resolveConfig({user, project, invocation, profiles, path})` takes versioned JSON objects and returns an immutable effective `config`, per-field `provenance`, matched override names, normalized path, and an `excluded` flag. The application must honor that flag when it selects inputs. File loading belongs to the checker layer.

`parseConfig(json)` parses JSON and validates its shape. The resolver also checks profile references, path patterns, phrase policy, terminology conflicts, and fidelity invariants. Unknown keys, unknown rule IDs, wrong value types, unsupported versions/locales, and invalid inactive overrides fail with `ContractError`; they do not trigger silent defaults. The supported editorial locale is `en-US`; source handling preserves other scripts.

Resolution proceeds in this order, with later values winning:

1. Bundled house defaults.
2. Settings from the selected named profile, which inherits house defaults.
3. User settings, then matching user path overrides in declaration order.
4. Project settings, then matching project path overrides in declaration order.
5. Invocation settings, then matching invocation path overrides in declaration order.

The last applicable `profile` selector chooses the named profile. Explicit setting fields retain precedence over profile defaults. Nested settings and rule maps merge by key; arrays replace prior arrays, and `[]` clears one. The resolver reports each winning field's origin.

All intensity modes retain GRAM-01, CLR-01, CLR-05, and STR-01 as errors. A caller can change a style rule through an explicit `rules` setting or a selected profile that declares that setting. FID rules stay errors and cannot be suppressed. Protected spans remain constraints on proposed fixes.

The house profile starts with the two phrase bans from the requirements example, `delve into` and `in today's fast-paced world`. It allows the lexical terms `robust regression` and `test harness`. These are a small initial vocabulary; the rule-pack task owns expansion and quality evaluation. The profile sets Chicago 18, grade eight, a 100-word metric minimum, and conservative Unicode policy. Its style settings do not make the corresponding checks available.

Example project configuration:

```json
{
   "version": 1,
   "profile": "house",
   "forbiddenPhrases": ["delve into"],
   "allowedTerms": ["robust regression"],
   "requiredTerminology": [{"preferred": "sign in", "avoid": ["log in"]}],
   "overrides": [{
      "files": ["docs/**/*.md"],
      "settings": {"readability": {"targetMaxGrade": 8}}
   }],
   "suppressions": [{
      "ruleIds": ["LEX-01"],
      "paths": ["examples/**"],
      "reason": "Literal examples of prohibited wording"
   }]
}
```

Path patterns are positive project-relative POSIX globs, using [picomatch](https://github.com/micromatch/picomatch), with dotfiles included and no leading negation. Absolute paths, parent traversal, backslashes, empty components, and malformed brackets fail. The caller supplies a project-relative input path. Inputs without a path receive no path overrides or path-specific suppressions.

## Source and matching

`createSource(stringOrBytes)` accepts well-formed strings or valid UTF-8 bytes. It preserves a BOM, combining sequences, emoji, and original newlines. Invalid UTF-8 and unpaired UTF-16 surrogates fail before hashing. SHA-256 covers the original UTF-8 representation.

Offsets use zero-based, half-open UTF-16 ranges. Locations use one-based lines and Unicode-scalar columns; combining marks count as separate scalars. CRLF is one line break, and lone CR/LF each start a line. Offsets cannot split a surrogate pair or CRLF. Empty spans are valid source positions, but findings, suppressions, and replacement fixes require nonempty ranges. Insertion fixes and grapheme-safe application remain in PHB-025.

All finding and fix ranges refer to the original source. Never pass offsets from decoded Markdown text, normalized strings, or concatenated prose into this API. PHB-021 must supply an exact mapping or disclose incomplete coverage. This layer verifies original text and positions; it does not infer a decoded-to-source mapping.

`findPhraseMatches(source, phrase, matching)` returns original ranges, including overlapping occurrences. Matching treats phrases as literal text, with Unicode case-insensitive matching by default. There is no stemming or Unicode normalization. The `horizontal` whitespace policy accepts tabs and Unicode space separators between words; it does not cross line breaks. `literal` requires the exact whitespace. `caseSensitive: true` disables case folding.

Unicode letters, marks, numbers, and connector punctuation form word boundaries. An apostrophe between word characters belongs to the word, so `we` does not match inside `we're`. Quotes around a word remain delimiters; the parser must supply their protection. An allowlisted term must contain the entire finding, and lexical allowlists do not disable grammar rules.

Inline suppressions use the [suppression schema](../schemas/suppression.schema.json): version, rule IDs, original range, and reason. The contract validates them but does not parse a comment syntax. The Markdown parser will supply trusted suppression spans. Partial overlap cannot suppress a finding. Suppression and lock comment syntax remain PHB-021 work.

## Findings, fixes, and coverage

`createFinding(...)` combines an original span with a known rule, evidence, effective severity, and reason. Findings distinguish `confirmed`, `candidate`, `conflict`, and `suppressed`. A candidate for an error-level house rule keeps `ruleSeverity: "error"` while displaying `severity: "warning"`. A contextual rule needs semantic confirmation to become a confirmed violation.

A protected-content match becomes a conflict unless a documented suppression exempts it. Suppressed findings retain their reason in the report. Imported findings must match the source hash, rule version, text, positions, effective rule level, and actual exemption. A claimed exemption cannot validate itself.

Fixes carry a source hash, exact original text, replacement, original range, and fix policy. Unresolved or suppressed findings cannot carry fixes. An exact phrase match does not authorize a `safe-local` replacement for a rule whose fix policy requires editorial review. Fix validation rejects protected intersections and invalid source preconditions. Applying patches, checking overlapping edits, and atomic file writes belong to PHB-025.

`buildReport(...)` always includes `boundaries` and all 40 catalog rule IDs. Unprovided checks appear as skipped with reasons. Disabled rules remain visible and do not count against coverage. This is a contract for execution evidence supplied by check implementations; the report builder cannot prove that a detector ran or that a model's judgment was correct.

| Field or outcome | Meaning |
| --- | --- |
| `coverage` | Complete, partial, or failed across enabled rules and boundary detection |
| `requestedCoverage` | The same states for the requested checks |
| Local scope | Defaults to boundaries, LEX-01, and Unicode inventory families; callers can request an explicit subset of rules, with boundaries always required |
| Editorial scope | Requires every enabled rule; cannot narrow the request to hide missing checks |
| Exit `0` | Requested checks complete; no confirmed/conflict findings at the selected threshold |
| Exit `1` | Requested checks complete; a confirmed violation or unresolved conflict reaches the threshold |
| Exit `2` | A check failed, a required check is incomplete/unavailable, or the calling command encountered a configuration/operational error |

A local run may have `exitCode: 0` and `coverage: "partial"`; its omitted contextual checks remain visible. Local scope cannot claim completed contextual rules or contain semantic-review findings. An unresolved candidate downgrades its rule check to partial. Configuration errors throw before a report exists; the CLI must map them to exit `2`.

JSON Schemas check structure through [Ajv's 2020-12 implementation](https://ajv.js.org/json-schema.html#draft-2020-12-breaking). Runtime validators enforce source equality, policy precedence, cross-field constraints, and preservation rules that schemas cannot establish alone. No local operation in this layer calls a model or introduces a remote processor.

## Verification and handoff

The 38 contract tests plus 25 parser-spike tests pass on Node 26.8.2 and Node 22.23.2. The exact declared minimum of 22.18 still needs a compatibility run. Tests cover invalid and inactive settings, profile precedence, explicit ban overrides, immutable fidelity rules, exact Unicode phrase boundaries, source hashes/positions, malformed input encodings, scoped suppressions, protected-content conflicts, fix preconditions, and complete/partial/failed reporting. They also compare catalog IDs with the documented catalog and verify generated files.

[project.org](../project.org) owns remaining work. PHB-021 implements input loading, parsing, projections, and local detectors. PHB-022 handles Unicode inventory/cleanup, PHB-023 supplies readability and checked Chicago subrules, PHB-024 supplies contextual review, and PHB-025 supplies patch application. The current metadata and passing contract tests do not establish those capabilities.
