# Unicode inventory and cleanup

`check` inventories original characters before any normalization. `clean` previews a limited set of deletions and writes files only with `--apply`. Both run locally. Neither operation tests statistical watermarks or determines who wrote a document.

```sh
node bin/phb.mjs check --format json draft.md
node bin/phb.mjs clean draft.md
node bin/phb.mjs clean --remove U+200B --remove U+00AD draft.md
node bin/phb.mjs clean --remove U+200B --apply draft.md
node bin/phb.mjs clean --preserve-bom draft.md
```

The [checker guide](CHECKER.md) describes shared inputs, profiles, exclusions, selections, trusted directives, and the 2 MiB input limit. Cleanup accepts the same inputs. Stdin supports previews; combining stdin with `--apply` is an error. Cleanup does not run phrase or grammar checks; its required scope is boundaries and enabled UNI-01–06 rules.

## Policy

The default policy removes the entire initial UTF-8 BOM run. This is a declared file-format choice, not a judgment that every BOM is unwanted. Set `unicode.bom` to `preserve`, or pass `--preserve-bom`, to retain it.

Other deletions require an explicit `unicode.remove` list or repeated `--remove` flags. The supported values are `U+200B`, `U+00AD`, `U+2060`, and `U+FEFF`. Removal applies only between ASCII letters in mapped prose. Consecutive selected artifacts can form one such interior run. A space, punctuation mark, non-ASCII letter, unselected artifact, or prose boundary prevents that removal. The option replaces the configured removal list.

```json
{
   "version": 1,
   "unicode": {
      "policy": "conservative",
      "bom": "preserve",
      "remove": ["U+200B", "U+00AD"]
   }
}
```

These controls can carry meaning: zero-width spaces and soft hyphens affect breaks; word joiners prevent breaks; joiners and selectors can affect shaping or presentation. That is why interior deletion requires an explicit choice. Other characters remain unchanged. [Unicode 17, chapter 23](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/).

There is no blanket stripping of bidi controls, tag payloads, joiners, selectors, accents, or special spaces. There is no typography conversion, NFKC normalization, or homoglyph replacement. Disabled rules and valid suppressions cannot produce edits. Code, quotations, citations, links, front matter, HTML, math, and trusted locks retain their protection. Incomplete boundary coverage blocks the entire file's cleanup, including BOM deletion.

## Inventory and coverage

Each [inventory item](../schemas/unicode.schema.json) records its rule ID, code point, Unicode name or control alias, original span/position, visible context, scope, action, certainty, and reason. Actions are `preserve`, `review`, or `remove`. Certainty is `recognized`, `policy`, or `unknown`; it describes the decision, not the exact observation of a character. Protected content remains visible in inventory and cannot become an edit. A selection limits inventory and findings to that source range.

| Rule | Implemented inventory |
| --- | --- |
| UNI-01 | BOM, zero-width space, word joiner, soft hyphen; only family with approved deletions |
| UNI-02 | ZWJ/ZWNJ and defined variation selectors |
| UNI-03 | Bidi controls and deprecated directional formatting controls; review only |
| UNI-04 | Non-ASCII spaces and Unicode line/paragraph separators; preserve |
| UNI-05 | Tag block; preserve listed emoji sequences and review other uses |
| UNI-06 | Other marks, format/control characters, and compatibility-decomposition characters; no normalization |

Listed emoji sequences and ordinary combining marks appear as preserved inventory entries without violation findings. Script-shaping and glyph-selection contexts can be preserved without certifying their validity. Bidi controls remain review items even when an author may have a valid use for them. An exact finding confirms the observed character and requested review, not malicious intent. Ambiguous cases never gain a deletion through a severity override.

Coverage refers to this declared inventory. It is not a complete confusables audit, a bidi-layout validator, or universal Unicode sequence validation. Unusual scripts/contexts remain untouched. Literal escape examples such as `\\u200B` and ASCII entity spellings such as `&#x200B;` contain no actual U+200B code point and are not rewritten by the inventory.

`check` now requires boundaries, LEX-01, and enabled UNI-01–06 rules by default. Its default threshold remains `error`; Unicode review items generally use lower severities. `clean` defaults to `suggestion`, so all unresolved inventory findings affect its result unless the caller chooses another threshold. Semantic style coverage remains partial on both commands.

## Plans, output, and application

JSON adds an inventory to each document. Cleanup also adds a validated [cleanup plan](../schemas/cleanup.schema.json) containing original/output hashes, proposed deletions, `outputText`, `outputSelection`, remaining review count, an output report, applied status, and exit code. A caller can extract `documents[0].cleanup.outputText` from a stdin preview. Text output shows visible code-point labels and exact deletion offsets. JSON escapes format controls while preserving their values after parsing.

| Outcome | Exit |
| --- | --- |
| Preview has proposed deletions | `1` |
| No pending deletions, or application completed | Output report's threshold result: `0` or `1` |
| Invalid input, incomplete required coverage, stale/forged plan, or application failure | `2` |

Source findings and positions always refer to the original input. `cleanup.afterReport` refers to the proposed output, even during preview. `applied: true` means that file replacement succeeded; an unchanged file has `applied: false`. Remaining ambiguous characters stay in the output. A successful cleanup result does not certify style compliance or watermark removal.

Before writing, the cleaner recomputes the plan from current bytes and policy. It rejects altered plans, stale hashes, unsupported deletions, overlaps, or protected intersections. It rescans the output and rejects plans that would expose another eligible edit or lose boundary coverage. Full-document cleanup is idempotent under the same policy. Selection offsets refer to a specific source revision; use the returned output selection after edits rather than reusing stale coordinates.

Application uses a temporary file in the same directory and an atomic rename. A native metadata-preserving copy retains file attributes before the text changes: macOS `/bin/cp -p`, or Linux `/bin/cp --preserve=all`. Ownership and permission checks must pass. The macOS tests cover extended attributes and ACLs; the Linux writer still needs platform validation. Other platforms support previews but currently reject changed-file application. Untouched bytes and newlines remain exact.

The writer refuses symlinks, files with multiple hard links, and destinations outside the chosen root. It rechecks identity, timestamps, and bytes immediately before replacement. An unrelated process can still write during the final check-to-rename window; this is optimistic concurrency, not a filesystem compare-and-swap guarantee. General document/container metadata processing remains outside this operation.

Batch application is per file. A valid file may change even if another file fails; the batch then returns `2` and reports each result. No batch-wide rollback is implied.

## Data and verification

The repository bundles 6,611 selected character records and 2,923 relevant emoji sequences from Unicode/Emoji 17.0. Sources, checksums, and generated-file hash live in [the manifest](../data/unicode-manifest.json), with [Unicode License V3](../data/UNICODE-LICENSE.txt). Character records derive from [UnicodeData](https://www.unicode.org/Public/17.0.0/ucd/UnicodeData.txt) and [NameAliases](https://www.unicode.org/Public/17.0.0/ucd/NameAliases.txt); emoji recognition uses listed qualified/unqualified forms from [emoji-test](https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt). This pins behavior to an explicit data edition rather than the host's newest Unicode release.

`node scripts/update-unicode-data.mjs` is an explicit maintenance command that downloads and regenerates those assets. Runtime checks, cleanup, and tests use bundled data and make no download. Tests cover preservation, original-source evidence, policy opt-ins, idempotence, malformed inputs/plans, file modes, per-file failures, and CLI execution with Node networking APIs disabled. Host lifecycle, the wider corpus, and release performance gates remain in [project.org](../project.org).
