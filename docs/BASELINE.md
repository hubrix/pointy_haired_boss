# First-release baseline

Recorded September 19, 2026, after Mark asked to push the current state and continue. These are working implementation choices under that request, not additional user approvals. [project.org](../project.org) owns their task status and any later changes.

| Choice | Baseline | Basis |
| --- | --- | --- |
| Product and command | Pointy Haired Boss; package `pointy-haired-boss`; command `phb` | Existing project name; reversible before release |
| First users and inputs | English general nonfiction, business writing, and technical documentation; UTF-8 text and Markdown | Covers the requested prose use cases with a testable initial boundary |
| Host coverage | Codex, Claude Code, and the confirmed DSH wrapper | User's requested hosts |
| Activation | Normal guidance while enabled; manual-only option; session on/off/status | Ponytail behavior with explicit control |
| House style | Ban adverbs, passive voice, contrastive “this, not that” framing, and agentless obligations | User-confirmed rules, retained at every intensity |
| General style | Chicago, 18th edition, with a documented implementation subset | Named edition for repeatable tests; house rules prevail |
| Reading target | Flesch–Kincaid Grade Level at most 8.0 for eligible English prose | User's eighth-grade preference; retain meaning and report exceptions |
| Punctuation | Flag overuse; support an explicit em-dash ban through configuration | No user instruction to ban every dash |
| Voice | Preserve the supplied author's voice; no invented persona or experiences | Fidelity requirements; sample-derived profiles remain a later task |
| Local tooling | Node-based checker with remark/unified, GFM/front-matter/math support, and portable skills; compromise supplies grammar candidates | [Measured parser decision](PARSER-SPIKE.md); contextual review remains required |
| Watermark delivery | Character inspection/cleanup in MVP; separate named-scheme statistical experiment | Keep the requested work visible without claiming unverified removal |
| Distribution | Private GitHub repository during development; no release/publishing decision yet | Conservative destination for the requested push |

Implementation must distinguish local scan coverage from completed contextual review. A rule's severity can be strict even when its detector requires judgment; uncertain candidates must not become a false clean result or an automatic destructive edit.

This baseline resolves PHB-010 and the timing choice in PHB-050. The experiment itself remains open as PHB-051. The [parser spike](PARSER-SPIKE.md) records the engine decision. [Host evidence](HOST-SPIKE.md) remains partial pending live lifecycle tests.
