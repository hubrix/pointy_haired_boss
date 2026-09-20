# Host probe fixtures

These plugins emit fixed markers for integration tests. They contain no PHB prose policy and are not release adapters.

- `codex/phb-probe` uses Codex metadata and `agents/openai.yaml` to request manual-only invocation.
- `claude/phb-probe` uses Claude metadata and `disable-model-invocation: true`.
- Hook scripts record only lifecycle metadata when the probe supplies `PHB_PROBE_EVENTS`. They never record prompts or transcripts.

Run the scripts described in [the host report](../../../docs/HOST-SPIKE.md). The scripts use temporary roots; do not install these fixtures into a personal marketplace. The Codex catalog test does not execute its hooks. The Claude native host test executes its hooks against a local model protocol stub.
