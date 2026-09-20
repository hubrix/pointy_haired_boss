# Live model compliance pilot

This evaluates a **prompt-only policy candidate**, before the production editorial
skill and adapters exist. It uses original synthetic prose. It makes real model
calls through existing Codex/Claude account sessions or the DSH wrapper's configured
localhost endpoint. It creates no accounts and installs no plugins.

```sh
npm run eval:compliance -- --host=codex --out=docs/eval/my-run/codex.json
npm run eval:compliance -- --host=claude --out=docs/eval/my-run/claude.json
npm run eval:compliance -- --host=dsh --out=docs/eval/my-run/dsh.json
node eval/compliance/summarize.mjs docs/eval/my-run/*.json
```

An output path must be new. To resume a partial run into a new file, add
`--resume-from=path/to/old-run.json`. The runner verifies the host, model settings,
corpus, policy, and prompt hashes before reusing the completed prefix; the original
failed attempt remains intact. The runner saves each request outcome so failures
survive a partial run. Transport/authentication failures stop that backend; invalid
model output remains an error and never becomes a clean result. The runner keeps
synthetic final responses and usage, not account credentials or host transcripts.

The runner reads only model/effort/provider selections from local configuration.
Codex user configuration and project instructions are disabled during test calls;
its existing login remains available. Claude uses safe mode, an empty settings
source list, no ordinary tools, and no session persistence. Host defaults and
structured-output mechanisms still differ. The native CLI is an observation point,
not evidence that an installed PHB plugin works. DSH uses its selected local model
directly; it does not boot the wrapper or copy its full agent prompt. Override the
DSH paths with `PHB_DSH_RUNTIME` and `PHB_DSH_SETTINGS` if needed. A remote DSH
endpoint fails rather than silently switching providers.

`cases.json` contains 17 passages, annotations, provenance, and CC0-1.0 dedication.
`policy.md` and `baseline.md` hold the conditions. The prompt omits expected results
and grading annotations. Each backend receives two fixed batches under both
conditions, followed by two PHB repeats of a three-case hard subset: **40 outputs
per complete backend run**, across six calls. The first hard-subset observation
occurs in the larger batch, so repetition differences can reflect batch context
as well as sampling. Condition order is fixed, not randomized. This is a development
pilot with limited genre coverage; it is not the proposed 200-passage frozen corpus.

Prompts, corpus, and policy hashes accompany every result. Codex and Claude retain
the selected effort setting. Claude has a reported-cost ceiling of $3 per call;
that is host list-price accounting, not proof of a subscription charge. DSH uses
explicit temperature 0.2 and the configured output-token ceiling. CLI temperature,
seed, hidden provider revisions, and some resolved model names are unavailable.
`--subset=hard` selects a separately labeled follow-up: the same three hard cases
under one generic request and three PHB requests. It changes batch size only;
never pool that adaptive follow-up into the original full-pilot denominator.
No endpoint falls back to another model. Each call has a ten-minute timeout.

`protocol.mjs` validates JSON shape, IDs, issue/status consistency, selected literal
invariants, protected bytes, unchanged controls, and measurable reading grade. It
also runs the existing checker and records **candidates**, not confirmed grammar
violations. Literal checks can miss changed relationships and flag valid synonyms.
A case with no mechanical flags has **not** passed semantic review. Outputs that
preserve an unfixable sentence and identify its missing actor can satisfy the
expected response while retaining a visible checker candidate.

Keep the first results unchanged after inspection. Record false alarms and missed
failures in a separate review artifact; do not adjust the rubric and silently
replace original scores. Prompt/tooling revisions need new versioned inputs and
new output directories. Independent human review, reader preference, broad Chicago
coverage, statistical watermarks, and production on/off behavior remain outside
this pilot. [The evaluation plan](../../docs/EVALUATION.md) defines release work.
