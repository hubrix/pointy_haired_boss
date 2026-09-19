# Pointy Haired Boss

A proposed prose-quality plugin for Codex, Claude Code, and DeepSeek Harness: write plainly, enforce a configurable house style, remove unwanted text artifacts, and preserve what the author means.

The default house style bans adverbs, passive voice, “this, not that” framing, and obligations without a named responsible actor. It targets an eighth-grade reading level and follows the Chicago Manual of Style where the house rules do not override it.

Inspired by [Ponytail](https://github.com/DietrichGebert/ponytail)'s persistent, adjustable guidance for coding agents. The repository contains research, requirements, and runnable parser/host experiments. The installable plugin remains under development.

[project.org](project.org) is the planning bible: current status, next steps, decisions, and future work. Every agent must follow [CLAUDE.md](CLAUDE.md) and keep the tracker current.

- [Research and implementation comparison](docs/RESEARCH.md)
- [Product requirements](docs/REQUIREMENTS.md)
- [First-release baseline](docs/BASELINE.md)
- [Initial rules and examples](docs/RULES.md)
- [Evaluation and release criteria](docs/EVALUATION.md)
- [Parser decision and measurements](docs/PARSER-SPIKE.md)
- [Host integration evidence and remaining gaps](docs/HOST-SPIKE.md)

The first-release baseline combines shared skills and rules, a local checker built on remark, conservative Unicode cleanup, and adapters for all three hosts. Editorial judgment uses the host's model. Statistical-watermark experiments have their own tracked milestone.

Run the development spikes with Node and npm (tested on Node 26.8.2):

```sh
npm ci --include=dev --ignore-scripts
npm test
npm run spike:parser
npm run spike:dsh -- /path/to/homebrew-qwen-dsh/runtime
```

The parser comparison writes measurements under `docs/spikes/`. The DSH probe uses the supplied runtime's installed packages and temporary fixtures; it does not start a model session or change host settings. Full lifecycle tests remain open in the tracker.
