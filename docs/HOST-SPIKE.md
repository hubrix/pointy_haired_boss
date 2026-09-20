# Host integration evidence

PHB-012, September 20, 2026. **Partial:** native Codex and Claude probes now cover discovery and manual skill expansion. Claude also passes resume and compaction hook checks. Model endpoints are local protocol stubs; these results establish host transport and lifecycle behavior, not model compliance. No production PHB plugin is installed in a user host.

| Host | Observed version | Evidence obtained | Still required |
| --- | --- | --- | --- |
| Codex CLI | 0.154.0 | Four app-server catalog/root checks; two native turn checks; scaffold and skill validation | Installed plugin activation, namespaced turn invocation, hook trust/execution, on/off, resume, compaction |
| Claude Code | 2.1.278 | Eight native checks: validation, discovery, manual expansion, hooks, resume, compaction, sibling isolation, session-only loading | Production adapter, real model compliance, on/off supersession, interactive UI, enforcement |
| Confirmed DSH wrapper | DSH packages 0.1.6-alpha.1; Cordis 4.0.2 | Eight service/event checks; native composition of both installed profiles and filesystem roots | Full boot and registry discovery, UI invocation, durable state, resume/compaction, output enforcement |

The DSH evidence comes from `/Users/mark/code/scratch/homebrew-qwen-dsh/runtime`. The global `dsh` executable and a separate source checkout have older versions and do not establish compatibility with this wrapper.

## Adapter contract

Keep a canonical skill/policy and package separate host manifests and lifecycle configuration. Each adapter must report the features it supports and which checks have completed. Hook configuration similarity is insufficient evidence of matching lifecycle behavior.

Codex packaging uses `.codex-plugin/plugin.json` and bundled skills. Use the default `hooks/hooks.json` location: the local plugin-creator validator rejects a manifest-level `hooks` field. Review exact hook definitions through the host's trust mechanism. An untrusted hook means automatic guidance is unavailable until trust is established. Keep manual invocation discoverable. [OpenAI packaging documentation](https://developers.openai.com/plugins/build/plugins), [Codex hooks](https://learn.chatgpt.com/docs/hooks).

Claude Code uses `.claude-plugin/plugin.json`, `skills/`, and `hooks/hooks.json`. `--plugin-dir` provides a development loading path; `claude plugin validate --json --strict <path>` provides static validation. Validation alone cannot establish that a hook ran or that the model followed its guidance. [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference).

For both hosts, investigate `SessionStart`, `UserPromptSubmit`, and compaction events to refresh the short policy. Their hook outputs can carry event-specific context, but each adapter must use its own supported event schema. Write/stop checks need a bounded recursion guard, a clear file scope, and status that distinguishes a delivered response from a checked artifact. [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code hooks](https://code.claude.com/docs/en/hooks).

Disabling future injection does not erase policy text already in the conversation. PHB's off switch must supersede earlier plugin guidance and verify the effect on the next turn. Restoring a mode must preserve user-selected intensity/profile without reviving another session's state. These are implementation requirements, not proven behavior.

## Codex native probes

```sh
npm run spike:codex
npm run spike:codex-turns
```

The [catalog probe](../spikes/hosts/codex.mjs) starts the installed app-server, reads a disposable local catalog through `plugin/read`, and verifies the namespaced skill and default hook file. It adds and removes a connection-scoped skill root through `skills/extraRoots/set`, then checks the refreshed `skills/list`. It calls no install or configuration-write methods. [Catalog results](spikes/codex-results.json) record four passing checks. This read-only app-server can load existing host configuration; it starts no thread or model call.

The [turn probe](../spikes/hosts/codex-turns.mjs) runs `codex exec` in a temporary workspace with `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, and a local Responses API stub. An ordinary turn receives neither the manual-only skill description nor its body. An explicit `$probe` expands the body into the outgoing request. [Turn results](spikes/codex-turns-results.json) record two passing checks. This uses project skill discovery; it does not establish installed-plugin activation or namespaced invocation in a turn.

The [Codex fixture](../spikes/hosts/fixtures/codex/phb-probe/) passes the installed plugin-creator validator and Codex skill validator. Its manual-only setting belongs in `skills/probe/agents/openai.yaml` as `policy.allow_implicit_invocation: false`. The local plugin validator rejects Claude's `disable-model-invocation: true` front matter. The app-server catalog does not expose this policy, so the turn probe checks its observable effect. Keep host metadata separate even when policy content is shared.

The installed `codex app-server generate-json-schema --experimental` output supplies the primary protocol contract for these tests. The fixtures use `.codex-plugin/plugin.json`; compatibility with newer universal `plugin.json` packaging has not been tested. Hook discovery does not prove hook trust or execution.

## Claude native lifecycle probe

```sh
npm run spike:claude
```

The [Claude probe](../spikes/hosts/claude.mjs) uses a disposable `CLAUDE_CONFIG_DIR`, an empty settings-source list, disabled tools, strict MCP loading, and `--plugin-dir`. It sends Messages API calls to a localhost stub with a dummy key. Temporary session files permit actual host resume and compaction; the probe deletes them on completion. It does not install an account plugin or alter user settings. The [Claude fixture](../spikes/hosts/fixtures/claude/phb-probe/) uses `disable-model-invocation: true`.

[Eight passing checks](spikes/claude-results.json) establish:

1. Native strict plugin validation succeeds without warnings.
2. The session plugin list includes the fixture.
3. `/phb-probe:probe` expands its body into the outgoing model request.
4. `SessionStart` and `UserPromptSubmit` execute and deliver event-specific context.
5. A resumed print session fires `SessionStart` with `source=resume`.
6. `/compact` fires `PreCompact` and `SessionStart` with `source=compact`; refreshed context reaches the next request.
7. A fresh sibling session receives neither the manual-only skill description nor its body without invocation.
8. A fresh invocation without `--plugin-dir` runs no fixture hooks and receives no fixture hook context.

These checks exercise the installed host with a deterministic response stub. They do not evaluate editing quality, model instruction-following, summary fidelity, or a production off command. Removing future injection still leaves previous guidance in an existing conversation. The fixture's hook event log contains only event names, sources, and temporary session IDs; recorded results omit transcripts, requests, and credentials. [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference), [Claude hook lifecycle](https://code.claude.com/docs/en/hooks).

## DSH composed profile inspection

```sh
npm run spike:dsh-composition -- /path/to/homebrew-qwen-dsh/runtime /path/to/wrapper-data/dsh
```

The [composition probe](../spikes/hosts/dsh-composition.mjs) uses installed `loadProfileDirectory` and `composeEntries` to combine bundle, generated profile, and home patch layers. It resolves the filesystem provider's roots, including symlinks, without booting plugins or evaluating `!!js` expressions. It avoids both wrapper `configure()` and the native CLI dump path, which rewrites `cordis.yml`. It records only discovery metadata, not settings or secret values.

[The inspected configuration](spikes/dsh-composition-results.json), under `~/.local/share/ninjaai/dsh`, differs by profile:

| Profile | Filesystem provider | Explicit custom roots | Seed directory is an active filesystem root |
| --- | --- | --- | --- |
| `dsh-tui` | Disabled | 0 | No |
| `headless` | Enabled | 0 | No |

No active filesystem root resolves to the seed directory. Individual skill symlinks and other runtime registrations remain untested; this is not proof that the full host cannot access a seeded skill. Both profiles include the Ponytail and Superpower provider plugins. Register PHB's bundled skill through the registry and test that registration in the booted wrapper. The TUI composition also reports a skipped patch for absent `workflow-worker-thread`; it does not target skill discovery. The probe records that warning and rejects new, unreviewed warnings. No wrapper changes were made.

## DSH native probe

```sh
npm run spike:dsh -- /Users/mark/code/scratch/homebrew-qwen-dsh/runtime
```

[The probe](../spikes/hosts/dsh.mjs) loads installed ESM packages through that runtime's resolution path and rejects unreviewed version changes. [Raw results](spikes/dsh-results.json) record versions, checks, and unverified behavior. It creates temporary fixture files and an in-process Cordis context, then disposes both. It makes no model calls and changes no wrapper or user configuration.

The eight passing checks cover:

1. Register/load a scoped skill with explicit model/user invocation controls.
2. Keep it out of sibling and global catalogs.
3. Register a manual-only skill and remove it through its disposer.
4. Verify that default roots do not imply discovery of the wrapper's `.gsd` seed location.
5. Discover/load a `SKILL.md` bundle through an explicit custom root.
6. Route `agent/pre-step` through the scoped Cordis waterfall; insert one instruction in the admitted batch; preserve rejection and avoid duplicates within that batch.
7. Stop new injections when the probe's enable flag is false.
8. Remove registered skills and listeners when their owning scope is disposed.

The wrapper's `lib/ninjaai.py` seeds skills into `~/.gsd/agent/skills`. The installed filesystem provider's default project/user roots use `.dsh` and `.agents`, with additional roots available through `customSkillDirs`. The service fixture proves that this seed location needs an explicit discovery path. The composition inspection above now verifies the installed filesystem-provider configuration; neither probe proves that the full wrapper is broken. The adapter should register its bundled skill through the registry or configure its own explicit root, then test the loaded wrapper composition.

Installed declarations establish `agent/pre-step` as a waterfall that returns `{kind: "enter", messages}` or `{kind: "reject"}`. The probe uses `createUserMessage` with `source.form: "instructions"`. `agent/request` returns a frozen call configuration; its contract forbids using it to mutate model-visible messages. Use the logged instruction/message path and preserve scoped event routing.

Source evidence under the wrapper runtime:

- `node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`: registry, providers, invocation controls, and disposal.
- `node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js`: roots, `customSkillDirs`, parsing, and loading.
- `node_modules/@deepseek-ai/dsh-scope/lib/types/index.d.ts`: scoped registrations and event carriers.
- `node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`: pre-step and request contracts.
- `node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js`: existing durable instruction projection.

These are primary installed sources for the pinned [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime. The probe dispatches synthetic events; it does not instantiate the full agent loop or prove persistence. Its one-batch duplicate guard is insufficient for production cross-turn state, cancellation, replay, or compaction. Those cases remain part of PHB-012 and the adapter tasks.
