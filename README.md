# Pointy Haired Boss

A proposed prose-quality plugin for Codex, Claude Code, and DeepSeek Harness: write plainly, enforce a configurable house style, remove unwanted text artifacts, and preserve what the author means.

The default house style bans adverbs, passive voice, “this, not that” framing, and obligations without a named responsible actor. It targets an eighth-grade reading level and follows the Chicago Manual of Style where the house rules do not override it.

Inspired by [Ponytail](https://github.com/DietrichGebert/ponytail)'s persistent, adjustable guidance for coding agents. The repository contains a local checker, Unicode inventory and cleanup, shared contracts, research, and parser/host experiments. Contextual editing, readability/Chicago checks, and installable host plugins remain under development.

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

The first-release baseline combines shared skills and rules, a local checker built on remark, conservative Unicode cleanup, and adapters for all three hosts. Editorial judgment uses the host's model. Statistical-watermark experiments have their own tracked milestone.

Run the checker, tests, and development spikes with Node and npm:

```sh
npm ci --include=dev --ignore-scripts
node bin/phb.mjs check draft.md
node bin/phb.mjs check --format json docs/
node bin/phb.mjs clean draft.md
npm test
npm run spike:parser
npm run spike:dsh -- /path/to/homebrew-qwen-dsh/runtime
```

`check` is read-only. Its default required scope covers prose boundaries, exact phrase bans, and Unicode inventory; all four house bans produce candidates for contextual review. `clean` previews approved character deletions and writes files only with `--apply`. Ambiguous characters stay intact. Reports show incomplete and omitted checks; exit `0` does not certify full editorial compliance or watermark removal. See the [checker guide](docs/CHECKER.md) and [cleanup policy](docs/UNICODE.md).

The parser comparison writes measurements under `docs/spikes/`. The DSH probe uses the supplied runtime's installed packages and temporary fixtures; it does not start a model session or change host settings. Full lifecycle tests remain open in the tracker.
