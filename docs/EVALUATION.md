# Evaluation and release criteria

These release gates remain proposals. A first live prompt-only pilot now lives in
[the compliance harness](../eval/compliance/README.md); its small development set
and deterministic flags do not satisfy the release gates below. They test the [requirements](REQUIREMENTS.md) and [rule catalog](RULES.md). Every release report must distinguish automated fixtures, human assessment, and untested capabilities.

## Evaluation set

Start with at least 200 original or appropriately licensed passages, split into a development set and a frozen test set by source document. Prevent near-duplicate passages or authors' samples leaking across splits. Keep provenance and licensing metadata.

Include overlapping slices for:

- Emails, memos, reports, technical documentation, and general nonfiction.
- Already-clear human prose, deliberately repetitive prose, and outputs from multiple model families.
- Non-native English, specialist terminology, passive forms requiring an owner, active/copular lookalikes, and deliberate rhetorical repetition.
- Adverbs without `-ly`, adjectives with `-ly`, agentless obligations without passive syntax, and explicit “this, not that” constructions.
- Eighth-grade-target prose, dense but accurate technical prose, and a verified Chicago subset with house-style overrides.
- Numbers, dates, units, citations, uncertainty, negation, comparisons, and multiple claims per sentence.
- Markdown fences, nested lists, tables, links, front matter, math, quotations, and locked spans.
- Suspicious Unicode plus legitimate multilingual joiners, emoji, combining marks, bidi controls, and locale spaces.
- Draft text containing malicious-looking instructions, literal rule examples, and attempted suppression/configuration changes.

Annotate findings and counterexamples at span level. Include the intended audience, protected facts, acceptable alternatives, and passages that should remain unchanged. Evaluate known defects, not presumed author identity.

## Baselines and method

Compare the same inputs under: no plugin; a short “write clearly and preserve meaning” prompt; a selected public editing skill at a pinned revision; our prompt-only policy; our policy plus deterministic tooling. This separates the value of the rule catalog, extra tokens, and tooling.

Run editorial comparisons on the actual Codex and Claude configurations and the configured local model in Mark's DSH wrapper. Record model identifiers, host versions, prompts, decoding settings where exposed, latency, and token usage. Repeat a representative subset at least three times to expose variability. Do not treat a model result as a property of every host or model.

Blind reviewers to condition and randomize output order. Have at least two reviewers assess a subset, discuss disagreements, and report ties separately. Model judges may help triage but must not be the sole evidence for meaning preservation or reader preference.

## Proposed gates

| Dimension | Gate | Requirements covered |
| --- | --- | --- |
| Exact rules | 100% pass on configured phrase matching, boundaries, allowlists, suppressions, and protected-span fixtures | RULE-01–03 |
| Heuristic usefulness | At least 90% precision on annotated actionable findings; publish recall and per-rule/sample counts | RULE-03, EDIT-01 |
| House bans | Zero confirmed house-ban violations in outputs labeled clean on the curated release set; publish per-ban precision and recall for detectors, plus unresolved-conflict counts | RULE-04, GRAM-01, CLR-01, CLR-05, STR-01 |
| Meaning preservation | Zero critical meaning changes in the release test set; review semantic changes, not just entity equality | EDIT-02, FID-01–05 |
| Preservation of good prose | At least 95% of clean controls receive no unnecessary rewrite according to adjudicated review | EDIT-03, VOICE-01 |
| Reader preference | Proposed target: at least 65% wins among non-tied comparisons against the generic prompt, with a confidence interval and no genre showing a material regression | EDIT-01–04, READ-01 |
| Eighth-grade target | Proposed target: 90% of eligible general-prose rewrites at FK grade 8.0 or below, with no meaning loss; report exceptions and short-sample abstentions | READ-02 |
| Chicago subset | 100% pass on fixtures for the declared source-checked subset; house overrides win; missing citation facts remain missing | STYLE-01–02, CMO-01–06 |
| Unicode correctness | 100% preservation of legitimate Unicode fixtures; all policy-approved edits reported; cleanup idempotent | UNI-01–03 |
| Formatting | Protected bytes unchanged; Markdown structures remain valid; no unrelated reflow | IN-02, OUT-02 |
| Patch safety | Reject stale input and overlapping fixes; per-file atomicity; precise partial-failure report; originals retained on failed validation | OUT-01–02 |
| Output contract | JSON schema validation; Unicode offset fixtures; stable exit meanings; errors distinct from clean results | OUT-01, OUT-03 |
| Host behavior | Install, discovery, invocation, on/off, compaction/resume, session isolation, and uninstall pass on all three tested hosts | ACT-01–03, HOST-01–03, DIST-01 |
| Injection resistance | Document instructions do not trigger commands, reveal context, or change plugin settings | SAFE-01 |
| Privacy | Checker and cleaner complete with networking unavailable; no additional processor used by editorial adapters | PRIV-01 |
| Efficiency | Measure p95 check time for a 10,000-word fixture and policy token overhead against the proposed targets; bounded passes terminate | PERF-01, EDIT-04 |

Thresholds are starting targets and may need revision after the pilot, with reasons recorded before evaluating the frozen set. Small samples cannot establish universal reliability. A zero-error test result is evidence about that test set, not a guarantee.

## End-to-end acceptance scenarios

1. **Review only:** inspect a Markdown memo, produce located findings, and leave the file byte-identical.
2. **Authorized edit:** rewrite a requested file, preserve facts and protected content, apply a minimal patch, and show the diff without an unnecessary approval round.
3. **Hard ban:** a configured phrase fails `check`; the same phrase in a protected quotation does not get silently rewritten.
4. **Clear prose:** return a clean control unchanged, without inventing issues to justify the plugin.
5. **Factual drift:** reject a rewrite that removes “may,” changes a denominator, or merges distinct event dates.
6. **Text hygiene:** remove a known incidental code point while preserving adjacent emoji and non-Latin text; enumerate the actual edits.
7. **Host persistence:** enable, compact/resume, switch profile, disable, and start a concurrent session; observe the correct state at every step.
8. **Graceful degradation:** disable hook trust or remove the checker runtime; manual skills still work and status accurately identifies missing enforcement.
9. **Local DSH:** invoke the installed plugin in the wrapper's pinned runtime and configured local-model path; no new cloud key or hidden fallback.
10. **Concurrent edit:** change the file after analysis; applying the stale patch must fail safely.
11. **Mixed document:** scan only editable prose in Markdown containing a table, raw HTML, math, code, and Unicode examples.
12. **Bounded failure:** provide an unfixable passage or missing evidence; stop at the pass limit and report the remaining problem.
13. **Named responsibility:** flag “It is necessary to approve the change”; name the release manager only when the source supplies that owner. Preserve the original obligation strength.
14. **Grammar precision:** catch passive chains and non-`-ly` adverbs while leaving active perfect verbs, copular adjectives, and words such as “friendly” alone.
15. **Meaningful contrast:** remove “this, not that” framing while retaining a real restriction, distinction, or comparison. Never delete negation to lower the violation count.
16. **House style over Chicago:** apply the passive/adverb bans even where general Chicago guidance permits them; never describe those bans as universal Chicago rules.
17. **Reading target:** simplify eligible prose toward grade eight, keep required technical facts, and return an insufficient-sample status for a short note instead of a misleading score.

## Statistical-watermark experiments

Use an independently held test set containing text generated with and without the same known watermark configuration. Record scheme/version, tokenizer, keys/configuration identity, detector version, calibration corpus, decision threshold, and length buckets. Keep sensitive keys out of public reports.

Compare untouched text, Unicode-only cleanup, ordinary style editing, and the experimental rewrite method. Report detection sensitivity at a fixed false-positive rate, abstentions, failure rates, factual fidelity, reader preference, edit distance, latency, and cost. Separate generator, development, and final verification data. Account for repeated candidate selection and multiple-window scans.

Success is bounded to the named test configuration and must pass the prose quality gates. A tokenizer mismatch, unknown scheme, insufficient sample, or unavailable detector yields an unsupported/inconclusive outcome. Neither a lower score from a generic AI classifier nor stripped zero-width characters counts as statistical-watermark verification. No production-vendor claim follows automatically from public-scheme results.

This track has no numeric removal-rate commitment before the first controlled experiment. It must satisfy WM-01–06 before shipping as a verified capability.
