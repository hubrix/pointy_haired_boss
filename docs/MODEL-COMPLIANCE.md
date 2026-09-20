# Live model compliance pilot

September 20, 2026. This is a prompt-only development pilot, before production
adapters exist. The policy improves several observed behaviors, but a model's
`clean` label does not establish compliance. Exact preservation needs a separate
check. The original outputs and flags remain intact; the review records false
alarms without replacing those scores.

## Method

The [harness](../eval/compliance/README.md) sends 17 original synthetic passages
under a generic editing baseline and the [PHB policy candidate](../eval/compliance/policy.md).
Three hard cases receive two further PHB observations in the completed cloud runs. A complete backend run has
40 outputs across six requests. Expected results and grading annotations stay out
of prompts. Corpus/policy/prompt hashes, versions, settings, usage, latency, and
final responses accompany the [run artifacts](eval/pilot-v1/).

- Codex CLI 0.154.0 requested the configured `gpt-6-astra` at `xhigh` effort. The
  CLI did not return a resolved model revision. Calls used temporary workspaces,
  ignored user configuration/project instructions, and retained account auth.
- Claude Code 2.1.278 requested the configured `opus[1m]` at `xhigh` effort. Its
  usage report identifies `claude-opus-5[1m]`, canonical model `claude-opus-5`.
  Safe mode disabled customizations; normal tools and session persistence were off.
- The wrapper's selected local endpoint is `qwen-orcarouter`, configured with the
  display name “Qwen3.8 Flash Next — OrcaRouter (Local).” Tests call that endpoint
  directly, with temperature 0.2 and its configured 8,192-token ceiling. They do
  not boot DSH or establish the identity of the underlying weight revision.

All test passages are synthetic; no project prose, credentials, or host transcripts are
in the artifacts. Native host defaults, output mechanisms, and decoding controls
differ, so this is not an isolated model-ranking experiment. Condition order is
fixed. The first hard-subset observation shares a larger batch, while repeats use
three-case batches; changes can reflect context as well as sampling. No prompt
was revised in response to model output during this run.

## Recorded counts

The initial 17-case cloud comparisons completed 40 outputs each, including repeats.
The figures below are **unadjusted mechanical screens**, not compliance rates.
The false alarms described below remain in these original scores.

| Backend | Generic: no mechanical flags | PHB: no mechanical flags | Initial comparison coverage |
| --- | --- | --- | --- |
| Codex / `gpt-6-astra` | 10/17 | 14/17 | Both batches complete |
| Claude / `claude-opus-5` | 10/17 | 15/17 | Both batches complete |
| Local `qwen-orcarouter` | 3/9 | No valid result from the nine-case PHB batch | Full pilot incomplete |

The six Codex requests took 359.1 seconds in total; Claude's six took 84.1 seconds.
These include host overhead and provider latency. Claude reports $0.5849 in
list-price accounting; that does not establish a subscription charge. Raw usage
is available for each request. No inferred dollar cost is assigned to Codex or Qwen.

## Findings from completed cloud runs

1. **Missing actors:** both PHB runs retain the unknown-actor passive and report
   `CLR-01`, rather than inventing a person who stored the samples. Both identify
   the missing reviewer in the agentless obligation. They preserve that behavior
   across the repeated passive case. Generic prompts often label these passages
   clean without the required house-rule finding.
2. **Exact preservation fails in Claude's delivered output:** the quotation in
   `unicode-preserve` contains `10\u00a0kg`. Both Claude conditions return
   `10\u0020kg` and claim clean. Other characters surviving does not excuse this
   byte change. Codex's PHB output preserves this quotation, its joiners, and the
   tested Markdown/code/URL bytes. This is a result for these fixtures only.
3. **Strict negation policy needs enforcement:** Claude's first PHB output retains
   “Do not retry a charge…” and claims clean. One repeated restriction similarly
   retains “Do not use production credentials.” The prohibition survives, but the
   pilot policy requires a faithful recast or an unresolved finding for a
   meaning-bearing negation adverb. Codex uses “Refrain from…” or “Exclude…”. This
   is the project's strict house policy, not a universal grammar or Chicago rule.
4. **Clean prose and structured facts:** both cloud PHB runs leave the clean
   adjective/copula/active-perfect control and the multi-date valve passage
   unchanged. Both preserve the board decision in the injection fixture. Keeping
   an injection instruction as source text is not proof of following it; no
   ordinary tool activity was observed, and the supplied board decision remains.
5. **Readability stays within target:** the original garden passage measures grade
   7.52. Codex's PHB rewrite measures 6.52; Claude's measures 6.72. Generic rewrites
   measure 6.32 and 5.93, respectively. This single passage began below grade eight;
   it does not test bringing a difficult source down to target or establish that
   the lower-grade rewrite is better. Meaning and reader preference need review.

The [inspection log](eval/pilot-v1/review.json) ties observations to output hashes
and exact examples. Its reviewer is this assistant, not an independent human
panel. Literal byte comparison proves the protected-space change; the log does
not certify full semantic preservation.

## Grading limits found by the pilot

The raw mechanical screen produces known false alarms:

- It lowercases a forbidden colon pattern, so correct `reason: She` still trips
  the `reason: she` check. Capitalization needs a case-sensitive assertion.
- The finite prohibition-word regex omits `refrain`; Codex retains the restriction
  while the screen flags its wording.
- `only` in `the only person` or `the only one` acts as an adjective. The corpus's
  word-level ban and the checker's grammar candidate overreach here. Likewise,
  `all` in `all prior rules` needs contextual POS review.

A response without mechanical flags is not a semantic pass. Token presence cannot
establish correct actor/date/quantity relationships. Candidate findings can be
false alarms. The opposite error also occurs: the mechanical screen accepts
Claude's negated prohibition, while policy inspection identifies an unreported
strict-house-rule conflict. Do not use the raw scores to rank models.

## Execution issues and remaining work

The initial Claude attempt returned “Not logged in” before producing an output.
Its child environment omitted `USER`/`LOGNAME`, which the macOS credential lookup
needed. Preserving those existing values restored access without touching auth
or changing the test prompt. [The failed attempt](eval/pilot-v1/claude.json) remains
alongside [the completed run](eval/pilot-v1/claude-r2.json).

The first Qwen attempt completed a generic batch, then failed after about five
minutes waiting for the PHB request. The server still answered its health check.
The retry uses an explicit ten-minute HTTP deadline and reuses the verified
completed prefix. The original failure remains in [the first attempt](eval/pilot-v1/dsh.json).
The [retry](eval/pilot-v1/dsh-r2.json) reached `finish_reason=length` at 8,192
completion tokens with an empty final content field after 275.2 seconds. This is a
bounded generation failure, not a clean edit or a completed compliance result.
The [three-case follow-up](eval/pilot-v1/dsh-hard.json) then exhausted the same
ceiling on its generic baseline with empty final content, so its PHB repetitions
were not attempted. The first generic nine-case result remains valid; smaller
batches alone did not establish reliable output. Further local calls stopped.

Qwen's PHB compliance is **inconclusive** under this test setup. Investigate the
local endpoint's reasoning/JSON-mode behavior and output budget before rerunning.
Changing those settings would be a new experiment, not a replacement for these
failures. No provider or model fallback occurred.

Follow-ups in [project.org](../project.org): protect exact spans with deterministic
checks before accepting edits; resolve negation conflicts without deleting meaning;
repair corpus/candidate false alarms; add above-target reading passages and broader
slices; and test the policy plus tools against a frozen corpus with independent
human review. Full Chicago compliance, reader preference, watermark behavior,
production activation/off switches, and adapter lifecycle behavior remain untested
by this pilot.


## Repository verification

The suite now includes 12 evaluation tests: response contracts, deliberate
preservation/fidelity mutations, short-sample abstention, transport deadlines, and
regressions from the actual Claude output. Frozen-result tests verify input hashes,
prompt hashes, and the original recorded scores. All 187 repository tests pass on
Node 26.9.0; the 12 evaluation tests also pass on Node 22.23.2. This validates the
harness and recorded checks, not a release-level prose quality claim.
