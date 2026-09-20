# Pointy Haired Boss

A proposed prose-quality plugin for Codex, Claude Code, and DeepSeek Harness: write plainly, enforce a configurable house style, remove unwanted text artifacts, and preserve what the author means.

The default house style bans adverbs, passive voice, “this, not that” framing, and obligations without a named responsible actor. It targets an eighth-grade reading level and follows the Chicago Manual of Style where the house rules do not override it.

Inspired by [Ponytail](https://github.com/DietrichGebert/ponytail)'s persistent, adjustable guidance for coding agents. The repository contains a local checker, readability measurement, a limited Chicago review subset, Unicode inventory and cleanup, shared contracts, research, and parser/host experiments. Contextual editing and installable host plugins remain under development.

[project.org](project.org) is the planning bible: current status, next steps, decisions, and future work. Every agent must follow [CLAUDE.md](CLAUDE.md) and keep the tracker current.

- [Research and implementation comparison](docs/RESEARCH.md)
- [Product requirements](docs/REQUIREMENTS.md)
- [First-release baseline](docs/BASELINE.md)
- [Initial rules and examples](docs/RULES.md)
- [Evaluation and release criteria](docs/EVALUATION.md)
- [Parser decision and measurements](docs/PARSER-SPIKE.md)
- [Host integration evidence and remaining gaps](docs/HOST-SPIKE.md)
- [Implemented contracts and API behavior](docs/CONTRACTS.md)
- [Local checker usage and coverage](docs/CHECKER.md)
- [Unicode inventory and cleanup](docs/UNICODE.md)
- [Readability and the sourced Chicago subset](docs/STYLE.md)

The first-release baseline combines shared skills and rules, a local checker built on remark, conservative Unicode cleanup, and adapters for all three hosts. Editorial judgment uses the host's model. Statistical-watermark experiments have their own tracked milestone.

Run the checker, tests, and development spikes with Node and npm:

```sh
npm ci --include=dev --ignore-scripts
node bin/phb.mjs check draft.md
node bin/phb.mjs check --format json docs/
node bin/phb.mjs check --require READ-01 --threshold warning draft.md
node bin/phb.mjs clean draft.md
npm test
npm run spike:parser
npm run spike:dsh -- /path/to/homebrew-qwen-dsh/runtime
npm run spike:codex
npm run spike:codex-turns
npm run spike:claude
npm run spike:dsh-composition -- /path/to/homebrew-qwen-dsh/runtime /path/to/wrapper-data/dsh
```

`check` is read-only. Its default required scope covers prose boundaries, exact phrase bans, and Unicode inventory. It also reports reading grade when the sample supports measurement, plus house-ban and Chicago candidates for contextual review. `clean` previews approved character deletions and writes files only with `--apply`. Ambiguous characters stay intact. Reports show incomplete and omitted checks; exit `0` does not certify full editorial compliance or watermark removal. See the [checker guide](docs/CHECKER.md), [metric and style limits](docs/STYLE.md), and [cleanup policy](docs/UNICODE.md).

The spikes write evidence under `docs/spikes/`. Host probes require the versions recorded in [the host report](docs/HOST-SPIKE.md). Codex and Claude turn probes use local protocol stubs; the DSH probes load installed libraries without starting a model. No production plugin is installed. Remaining trust, state, and lifecycle checks stay in the tracker.


A [live model compliance pilot](docs/MODEL-COMPLIANCE.md) compares generic editing
with the PHB policy using synthetic passages. See [the harness instructions](eval/compliance/README.md)
for opt-in commands that make real model calls. Its original outputs, mechanical
flags, and separate inspection notes are available for review; it does not certify
production adapter behavior or semantic correctness.
