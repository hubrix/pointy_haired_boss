# Pointy Haired Boss

A proposed prose-quality plugin for Codex, Claude Code, and DeepSeek Harness: write plainly, enforce a configurable house style, remove unwanted text artifacts, and preserve what the author means.

The default house style bans adverbs, passive voice, “this, not that” framing, and obligations without a named responsible actor. It targets an eighth-grade reading level and follows the Chicago Manual of Style where the house rules do not override it.

Inspired by [Ponytail](https://github.com/DietrichGebert/ponytail)'s persistent, adjustable guidance for coding agents. This repository currently contains research and draft requirements, not an implemented plugin.

[project.org](project.org) is the planning bible: current status, next steps, decisions, and future work. Every agent must follow [CLAUDE.md](CLAUDE.md) and keep the tracker current.

- [Research and implementation comparison](docs/RESEARCH.md)
- [Product requirements and proposed scope](docs/REQUIREMENTS.md)
- [Initial rules and examples](docs/RULES.md)
- [Evaluation and release criteria](docs/EVALUATION.md)

Recommended first release: shared skills and rule definitions, a local deterministic checker, conservative Unicode cleanup, and thin adapters for all three hosts. Use the host's model for editorial judgment. Keep statistical-watermark experiments separate from routine editing and report their actual verification limits.

Research date: September 19, 2026. Product name, command spelling, and defaults remain proposals.
