# Project instructions

`project.org` is the planning bible for this repository. It is the canonical source for task status, priorities, next actions, dependencies, decisions, blockers, and future work. These instructions apply to every agent working here.

## Keep the tracker current

1. At the start of each session, and after a context reset, read `project.org` before planning or changing files. Read the linked specifications needed for the current task. Check the working tree so you preserve other work.
2. Before starting work, find its task in `project.org` or add one. Give new tasks a unique, stable `CUSTOM_ID`, a concrete outcome, and a completion condition. Mark the task `DOING` when work starts. A request to record a future idea does not authorize its implementation.
3. Record new plans, follow-ups, discovered defects, scope changes, and deferred work in the tracker as they arise. Capture future ideas under the backlog even when they are outside the current scope. Never leave a promised next step only in chat, a temporary plan, a code comment, or session memory.
4. Update task state when the work changes. Check off completed work as you go; do not postpone all updates until the end of a long task. Keep dependencies and the next-action links accurate.
5. Mark a task `DONE` only when its completion condition holds. Add an Org `CLOSED` timestamp and a short evidence note linking the result and relevant verification. A written plan, partial implementation, or proposed test result does not prove implementation is complete. Reopen a task if new evidence invalidates completion.
6. For `WAITING`, record the blocker, who or what can resolve it, and the condition for resuming. Choose another useful task when possible. Preserve canceled work with a reason instead of deleting its history.
7. When the user makes a decision, record it as confirmed and update affected tasks and specifications in the same change. Label agent recommendations and unresolved choices as proposals. Do not invent approvals or turn routine reversible choices into approval gates.
8. Before a final response, pause, handoff, or commit that changes project work or plans, reconcile `project.org` with the actual files and checks. Update the current focus, next actions, changed task states, and a dated progress note. Leave unfinished tasks with a concrete next step; remove stale `DOING` states if work has stopped.

## Source of truth and Org conventions

- `project.org` owns the live plan. The files under `docs/` hold research, requirements, rule definitions, and evaluation details. Link them from tasks instead of copying their full contents into the tracker.
- Explicit user instructions take precedence. If the tracker and a specification disagree, resolve the mismatch and update both; do not silently discard a requirement or a confirmed decision.
- Use `TODO` for queued work, `NEXT` for ready work, `DOING` for work in progress, `WAITING` for a real dependency/blocker, `DONE` for verified completion, and `CANCELED` for abandoned work with a reason. `NEXT` means ready, not separately authorized.
- Use Org headings for tasks, `CUSTOM_ID` properties for stable links, and checkboxes for smaller steps. Preserve IDs when renaming or moving tasks. Keep completed tasks and decision history; any later archive must remain linked from `project.org`.
- A task may have a `DEPENDS_ON` property listing other task IDs. This property is documentation, not automatic scheduling or enforcement.
- Keep one canonical tracker. Any scratch plan, external planning tool, or generated task list must reconcile back into `project.org`; do not introduce a competing `TODO.md`, `PLAN.md`, or roadmap.
- Keep notes concise and factual. Record actual checks and known limits. Avoid secrets, full transcripts, speculative dates, and invented performance numbers.

## Confirmed product direction

Build a prose plugin for Codex, Claude Code, and DeepSeek Harness, inspired by Ponytail. The DSH integration target is `/Users/mark/code/scratch/homebrew-qwen-dsh`.

The default house style bans adverbs, passive voice, “this, not that” framing, and agentless obligations. Target eighth-grade readability and use Chicago as the general style reference, with explicit house rules taking precedence. Preserve meaning; flag missing information instead of inventing it. See the tracker and linked requirements for scope and open decisions.
