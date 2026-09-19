# Parser and grammar decision

PHB-011, September 19, 2026. Choose **remark/unified with GFM, front matter, and math extensions** for the shared parser. Keep original-source patches separate from the AST. Use **compromise as a grammar candidate generator**, with contextual review required to clear the house bans.

The runnable comparison lives in [spikes/parser](../spikes/parser/); [raw results](spikes/parser-results.json) contain every fixture, mismatch, timing sample, dependency root, and environment detail. This completes the engine-selection spike. The product checker remains unimplemented.

## What ran

```sh
npm ci --include=dev --ignore-scripts
npm test
npm run spike:parser
```

The lockfile pins dependencies. The spike uses Node's built-in test runner. The measured machine ran Node 26.8.2 on an Apple M4 Max, macOS arm64. The declared Node 22.18 minimum has not yet passed a compatibility run.

The comparison applies the same span-extraction and sentinel-scan policy to both ASTs. Sixteen hand-labeled fixtures cover prose, emphasis, code, nested blockquotes, link labels/destinations/titles, images, autolinks, YAML/TOML, math, block/inline HTML, footnotes, reference links, tables, task lists, CRLF, emoji, combining marks, escapes, and entities. Three additional fixtures expose missing quote, citation, and locked-region protection.

All **25 tests passed**. Some tests deliberately verify known omissions; this count does not mean all product requirements pass. A separate test runs the native textlint kernel and checks its reported source range.

## Results and tradeoffs

| Property | remark configuration | textlint Markdown processor |
| --- | --- | --- |
| Parser-boundary fixtures | 16/16 | 15/16; math exposed as prose |
| Additional boundary-policy fixtures | 0/3 | 0/3 |
| Source positions | UTF-16 offsets | UTF-16 ranges |
| Escapes and entities | Decoded text differs from source | Decoded text differs from source |
| Cold process plus scan, median / sample p95 | 103.06 / 119.57 ms | 79.22 / 89.92 ms |
| Warm parse plus scan, median / sample p95 | 14.34 / 18.23 ms | 17.87 / 21.43 ms |
| Installed dependency closure | 130 packages, 8,347,332 file bytes | 62 packages, 1,789,692 file bytes |

Adding the textlint kernel gives 69 packages and 2,552,075 file bytes. Its rule/fix execution time is **outside** the parser timing column. Compromise adds a four-package closure of 2,877,368 file bytes; closures overlap and must not be summed as unique totals.

The corpus has 10,017 words in repeated plain paragraphs. Cold timings include seven fresh Node processes, imports, parsing, extraction, and scanning. Warm timings use 20 samples after two warmups. Dependency measurements sum installed regular-file sizes for the resolved lockfile closure, excluding nested dependencies from each package's own size; these are neither download sizes nor allocated disk blocks. Runs used a shared development machine. Small-sample p95 values describe this run and do not establish a service-level guarantee. Grammar, Unicode inventory, configuration, file reads, contextual review, and rich-document throughput still need measurement under PERF-01.

Textlint offers a smaller installed footprint and faster startup in this experiment. Its processor could gain math support through another processor or extension. Choosing remark gives this project direct control over Markdown extensions and source mapping without adapting rules to a second diagnostic/fix contract. This is a project decision based on the tested configuration. The [textlint kernel](https://github.com/textlint/textlint/tree/master/packages/%40textlint/kernel) remains a viable later interoperability target.

The implementation uses the documented [remark parser](https://github.com/remarkjs/remark/tree/main/packages/remark-parse), [GFM extension](https://github.com/remarkjs/remark-gfm), [front-matter extension](https://github.com/remarkjs/remark-frontmatter), and [math extension](https://github.com/remarkjs/remark-math). The extensions identify document syntax; PHB still owns the editing policy.

## Source-edit contract

The prototype edits the original string, preserving surrounding Markdown and CRLF. It checks a SHA-256 input hash, exact expected text, nonoverlapping ranges, valid UTF-16 boundaries, and containment in a patchable prose span. Tests reject stale content, overlap, code edits, split surrogate pairs, and edits whose decoded-to-source mapping is unresolved. Line and column examples use one-based positions, scalar-value columns, and CRLF as one line break.

The spike refuses edits across AST text-node boundaries or within decoded spans such as `&amp;`. Production needs a source projection that joins sentence context across emphasis and links while retaining a reversible mapping. It also needs a defined insertion policy and grapheme-boundary checks. The prototype never serializes the entire Markdown AST to apply a wording change.

## Grammar findings

[Compromise 14.17.0](https://github.com/spencermountain/compromise) agreed with **16 of 20** hand-labeled sentence cases after the adapter excluded punctuation from adverb tokens. This tiny development sample is not a release evaluation.

It recognized common adverbs, including `hard` and `late`, and avoided treating `friendly`, `lovely`, and adjectival `daily` as adverbs in the tested sentences. It detected several forms of passive voice and distinguished `The server is ready.` from them. Its adverb view omitted `not` and `never`; its passive flag missed `needs to be reviewed` and the reduced passive in `The report, approved by Maya, reached the board.`

The selected approach combines grammar candidates with contextual review. A suffix match cannot enforce the adverb ban, and a passive-flag absence cannot certify active voice. Deleting a negative adverb would reverse meaning. A reviewer must preserve negation through a faithful recast or report an unresolved conflict. Agentless obligation and rhetorical contrast also require contextual checks; this spike does not implement them.

## Work handed to implementation

[project.org](../project.org) owns the follow-ups: PHB-020 covers offset/schema/coverage contracts; PHB-021 covers quotation and citation protection, lock syntax, inline-HTML policy, sentence projections, unknown-node coverage, and expanded grammar candidates; PHB-025 covers production patch application. These remain required first-release capabilities. PHB-030 and PHB-031 own the larger corpus and quality measurements.

Protecting the entire paragraph around inline HTML currently skips surrounding prose. Both parsers still expose inline quotations, author-date citations, and user-locked passages as text. Local coverage must disclose such omissions until the corresponding policies exist. No fixture result authorizes editing those regions.
