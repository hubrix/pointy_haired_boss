# Research: prose quality, LLMisms, and watermarking

Research date: September 19, 2026. Scope: implementation references and primary documentation, with selected research papers. Repository features below were inspected in documentation or source; their quality and performance claims were not independently benchmarked. Recommendations are our synthesis.

## Findings that shape the product

1. Persistent writing guidance and explicit review commands are complementary. A portable skill supplies judgment; a local checker supplies repeatable enforcement.
2. Style violations are not proof of AI authorship. Phrase lists help enforce preferences, while paragraph structure and preservation of meaning require context.
3. Hidden-character cleanup, stylistic editing, and statistical-watermark mitigation need distinct operations and result labels.
4. Preserving good writing is a release criterion. A system that always rewrites will erase voice and sometimes change claims.
5. Compatibility must include activation, disabling, and context restoration, not just installation of the same Markdown file.

## Existing implementations

| Implementation | Observed approach | Useful design | Limitation or tradeoff |
| --- | --- | --- | --- |
| [Ponytail](https://github.com/DietrichGebert/ponytail), especially its [main skill](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md) | Ordered decision ladder, persistent modes, intensity levels, skills, and host adapters | A short editorial policy that stays active; separate review operation; clear off switch | Coding results do not establish prose quality. Avoid reducing the goal to minimum length. |
| [blader/humanizer](https://github.com/blader/humanizer/blob/main/SKILL.md) | Prompt skill covering rhetorical staging, rhythm, inflation, formatting, and chat residue; sample-based voice matching | Structural review and explicit meaning checks | Prompt compliance varies; adding an inferred personal reaction can change the author's stance. Our editing mode should prohibit that. |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop/blob/main/SKILL.md) | Compact instructions, phrase and structure references, self-scoring | Small always-active policy and concrete examples; adverb/passive bans match Mark's chosen house style | Grammar detection and meaning-preserving rewrites need context; its em-dash ban is a separate choice. |
| [stephenturner/skill-deslop](https://github.com/stephenturner/skill-deslop) | Related editing rules with scientific and technical register guidance | Domain-aware exceptions and reference catalogs | Its broad quick checks still need exceptions and external evaluation. |
| [ozdemircili/deslop](https://github.com/ozdemircili/deslop) | Python flagger plus a skill that interprets findings and rescans | Deterministic candidates, density rules, domain exceptions, machine-readable findings | Weighted phrase counts are editorial heuristics, not calibrated human-quality scores. |
| [isatimur/de-slop](https://github.com/isatimur/de-slop) | Offline flagger, rewrite workflow, bounded iteration, and fidelity fixtures | Separate fixable wording from missing substance; cap revision loops | Passing its own detector is not independent evidence of better writing. |
| [hannsxpeter/humanizer](https://github.com/hannsxpeter/humanizer) | Pure-prompt editing, voice profiles, restraint rules, Unicode preflight | Good-writing preservation and separation of text hygiene from file provenance | A model cannot reliably inventory exact hidden code points without deterministic tooling. |
| [Vale](https://docs.vale.sh/topics/styles) and its [markup scopes](https://vale.sh/features/markup) | Declarative styles, severities, scoped matching, actions, and terminology | Versioned rule packs, exclusions, diagnostics, optional future interoperability | Extra binary and rule-dialect dependency; cannot itself judge whether a paragraph says anything useful. |
| [textlint](https://github.com/textlint/textlint) | Pluggable natural-language linter; Markdown/text parsing; fix and dry-run interfaces | Strong candidate for a Node implementation; positioned diagnostics and extensible rules | No bundled editorial policy. Evaluate package and runtime footprint before selecting it. |
| [retext](https://github.com/retextjs/retext) and [retext-readability](https://github.com/retextjs/retext-readability) | Natural-language syntax trees and plugins, including several readability formulas | Reusable linguistic analysis for warnings | Formula agreement is not comprehension. Some algorithms were designed for whole documents rather than individual sentences. |
| [write-good](https://github.com/btford/write-good) | Small configurable checks for passive voice, wordiness, repetition, clichés, and similar patterns | Cheap, explainable local checks | Grammar patterns often need context; do not adopt every warning as an error. |
| [proselint](https://github.com/amperser/proselint) | Configurable editorial checks and CLI/library integration | Mature examples of rule identifiers and editorial coverage | General usage advice needs adaptation to each register and house style. |
| [CMOS for PerfectIt](https://www.chicagomanualofstyle.org/help-tools/perfectit.html) | Official Chicago-style proofreading integration covering spelling, capitalization, hyphenation, numbers, and punctuation | Reference for the scope of a general style-consistency pass | Word integration with subscriptions to both products; not a portable open rule pack to bundle. |
| [ai-text-sanitizer](https://github.com/BeMoreDifferent/ai-text-sanitizer) | JavaScript cleanup, per-rule counts, Unicode handling, punctuation conversion, and transport-artifact removal | Small local utility design and auditable change counts | Defaults such as dropping bidi controls or citation placeholders are too destructive for our general prose mode. Detector claims need separate validation. |
| [cyzanfar/text-watermark-remover](https://github.com/cyzanfar/text-watermark-remover) | Local Unicode analysis/cleanup plus experimental model and detector integrations | Distinct verified/unverified outcomes; preserve original when quality checks fail | Its built-in reference detector configurations do not establish removal of production vendor watermarks. |
| [guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) | Skill, local service, deterministic text cleanup, best-effort rewrite, and file/media processing | Explicit separation of character, statistical, and container layers | Much broader than a prose plugin; service and media dependencies are unnecessary for the first release. |
| [SynthID Text](https://github.com/google-deepmind/synthid-text) and [MarkLLM](https://github.com/THU-BPM/MarkLLM) | Watermark implementations and research/evaluation infrastructure | Controlled fixtures for testing known schemes | Research configurations are not interchangeable with private provider deployments. |

License observations: Ponytail, the listed humanizer/deslop skills, retext, and write-good describe MIT licensing; proselint describes BSD licensing. These observations are not a completed dependency/license audit. Before importing any code or rule text, pin its revision, inspect the actual license and transitive dependencies, and preserve required attribution. Some catalogs trace examples to other sources; write original examples rather than copying large passages.

## What counts as an LLMism?

For this product, an LLMism is a configurable editorial pattern: empty setup, unsupported importance, repetitive contrast, stock transitions, generic praise, formulaic formatting, or another habit that impedes the intended voice. The term describes the text, not its author.

Kobak and colleagues found population-level shifts in biomedical vocabulary associated with LLM use. This supports investigating lexical patterns; it does not justify classifying an individual writer because they used a word such as “delve.” [Study](https://arxiv.org/abs/2406.07016).

Authorship-detector evidence is context dependent. A 2023 study reported false positives affecting non-native English writing. A 2026 study in Czech found no systematic non-native bias in its tested detector families. Neither result establishes universal reliability or universal failure. Our product should measure editorial quality and false positives directly. [English study](https://arxiv.org/abs/2304.02819), [Czech study](https://arxiv.org/abs/2602.05769).

Design implication: explicit user bans can be enforced exactly; general style suggestions need context, counterexamples, and suppressions. Never label a document “87% human” or infer authorship from its style findings.

## Readability and voice

Plain-language guidance emphasizes audience, clear organization, familiar words, and useful verbs. This supports checks for buried main points, unexplained jargon, nominalizations, and unclear actors. It also supports retaining headings and lists when they help readers. [Digital.gov principles](https://digital.gov/guides/plain-language/principles).

Readability formulas are useful supporting measurements but can reward writing that omits essential information or uses awkward fragments. CDC explicitly illustrates this failure and provides a broader communication index. Use length and grade estimates as diagnostics, with comprehension and meaning preservation as the outcome measures. [CDC writing guidance](https://www.cdc.gov/nceh/clearwriting/mod2/index.html), [Clear Communication Index](https://www.cdc.gov/ccindex/tool/index.html).

Mark chose a stricter house style: ban adverbs, passive voice, “this, not that” framing, and agentless obligations; prefer an eighth-grade reading level; follow Chicago for general style. These are product requirements, not conclusions about what every human writer should do.

Apply those bans through rewrites that preserve meaning. If an actor is unknown, flag the missing owner instead of inventing one. When an adverb carries scope, frequency, uncertainty, or negation, preserve that information in another construction or report an unresolved conflict. Do not silently waive a ban or remove meaning to satisfy it.

### Chicago and grade-level guidance

Use the 18th edition of the Chicago Manual of Style (2024) as the named reference edition. Its scope includes grammar, punctuation, spelling and compounds, names and titles, numbers, abbreviations, quotations, and citations. [Official contents](https://www.chicagomanualofstyle.org/book/ed18/frontmatter/toc.html).

Chicago's public guidance does not prescribe a blanket passive-voice ban. The user's prohibition is an explicit house-style override. Keep those sources of authority distinguishable in rule descriptions. [Chicago Q&A, based on the 17th edition](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Usage/faq0198.html).

Chicago supports both notes/bibliography and author-date citations. Preserve the document's selected system; do not invent references or force footnotes into ordinary emails. A first release should publish its implemented Chicago subset and cite each rule's checked source rather than claim complete compliance. [Official citation guide](https://www.chicagomanualofstyle.org/tools_citationguide.html).

Flesch–Kincaid Grade Level provides a repeatable approximation for the eighth-grade target. Treat 8.0 as the target ceiling for eligible general prose, report short samples as insufficient, and pair the score with editorial review. The metric cannot justify deleting technical facts. [Microsoft's readability explanation](https://support.microsoft.com/en-au/office/get-your-email-s-readability-and-level-statistics-aa374906-2a39-45e5-a735-7c7361c8fb07).

Agentless obligation needs its own rule: active syntax alone does not establish responsibility. For example, “It is necessary to approve the budget” leaves the owner unnamed. The National Archives' drafting guidance connects active construction to responsibility and distinguishes obligation from prediction or discretion. Our rule should preserve those distinctions and name an owner supported by the source. [Clear-writing guidance](https://www.archives.gov/federal-register/write/legal-docs/clear-writing.html).

## Watermarking: four separate mechanisms

| Mechanism | What it is | Proposed treatment | What a successful operation establishes |
| --- | --- | --- | --- |
| Stylistic signature | Repeated lexical and rhetorical habits | Normal prose editing | Specified style issues were addressed |
| Character artifacts | Zero-width characters, formatting controls, unusual spaces, or embedded tag payloads | Inspect exact code points; clean under an explicit context-aware policy | Listed characters were removed or normalized |
| Statistical text watermark | Signal encoded through token selection during generation | Separate experimental rewrite/detector workflow | At most a result for the named scheme, configuration, and detector threshold |
| File/container provenance | Document properties, metadata, signatures, or content-credential structures | Defer document/media processing from the prose MVP | Requires format-specific inspection; plain-text editing cannot establish its removal |

Kirchenbauer et al.'s watermark promotes selected tokens while sampling. Its signal is statistical, not a list of invisible characters or forbidden vocabulary. [Paper](https://arxiv.org/abs/2301.10226).

Google's SynthID documentation describes generation-time watermarking, private configuration parameters, and probabilistic detection. It reports resilience to some light transformations, while thorough rewriting or translation can lower detection confidence. Therefore a wording change can affect a watermark without proving removal; unavailable or incompatible detection must remain “unknown.” [Official SynthID documentation](https://ai.google.dev/responsible/docs/safeguards/synthid).

Unicode format controls can be legitimate text. Joiners affect scripts and emoji; direction controls and nonbreaking spaces can preserve intended display. Their presence is not evidence of watermarking. Blanket removal or compatibility normalization can damage content. [Unicode chapter 23](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/).

Recommendation: ship deterministic character inspection and conservative cleanup first. Retain statistical mitigation as a separate research track with controlled marked/unmarked samples, named detectors, quality gates, and an explicit unverified outcome. Do not market ordinary cleanup as universal watermark removal.

## Host integration evidence

| Host | Verified surface | Proposed adapter |
| --- | --- | --- |
| Codex | Skills, plugin packaging, lifecycle hooks, and hook trust are documented | `.codex-plugin/plugin.json`, shared skills, host-specific lifecycle configuration, manual-skill fallback |
| Claude Code | Plugin skills and commands; `.claude-plugin` packaging; lifecycle hooks | Shared skills with Claude metadata and hook adapter |
| DeepSeek Harness | Cordis plugins and skill providers; local skill discovery and per-step catalog handling | Native ESM/Cordis adapter that registers shared skills and supplies bounded policy context |

Sources: [OpenAI plugins](https://learn.chatgpt.com/docs/plugins), [OpenAI hooks](https://learn.chatgpt.com/docs/hooks), [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference), [Claude hooks](https://code.claude.com/docs/en/hooks), [DSH skills](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/subsystems/skills.md), [DSH plugin tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/cordis-tutorial/01-first-plugin.md).

Local target inspection:

- Mark confirmed `/Users/mark/code/scratch/homebrew-qwen-dsh` as the DSH integration target. Its `runtime/package.json` pins DSH packages to `0.1.6-alpha.1` and Cordis to `4.0.2`; the checked-in web-search plugin demonstrates the ESM packaging pattern.
- That wrapper documents seeding skills into `~/.gsd/agent/skills`. Verify the active profile's discovery configuration during implementation rather than assuming upstream default paths apply.
- The separate `/Users/mark/code/dsh/deepseek-harness` checkout was inspected at `c291e7961a515f6d7af9304e7fd1d257929aef26`. It describes an earlier `0.1.5-rc.2` tree, so its API documentation is supporting evidence, not proof of runtime compatibility with the wrapper.
- The local Codex plugin-creator reference has conflicting examples around a manifest `hooks` field. Its validator guidance says to omit that field; current official docs also describe default `hooks/hooks.json` discovery. Use the supported layout and validate against the installed host during implementation.

A discovered skill is not an always-active policy. Activation, restoration after compaction, session isolation, off-switch behavior, and duplicate hook handling must be tested separately in each host. Prompt instructions alone also cannot guarantee every emitted sentence complies with a hard rule.

## Build, reuse, or wrap?

| Option | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Prompt-only skill | Smallest package; host-portable | No reliable code-point inventory or repeatable hard-ban enforcement | Ship as fallback, not the whole product |
| Shared skill plus focused local checker | Combines judgment and deterministic rules | Requires parser, diagnostics, and meaningful tests | Preferred product shape |
| Vale-backed implementation | Established rule packs and scoped linting | Binary dependency and separate rule dialect | Evaluate as optional adapter; avoid reimplementing its whole ecosystem |
| textlint-backed implementation | Fits Node/DSH; parser and fix infrastructure | Dependency footprint and framework coupling | Compare with a small library-based core in an implementation spike |
| Full watermark-removal service | Broad format coverage | Large unrelated scope; statistical assurance remains scheme-specific | Do not make it the prose engine |

Prefer TypeScript/Node for a shared checker and native DSH adapter, subject to the parser spike. Reuse a proven Markdown parser. Keep the host's existing model as the editing engine; require no additional cloud API or model download. MCP is optional interoperability work, not a prerequisite for using a local CLI.
