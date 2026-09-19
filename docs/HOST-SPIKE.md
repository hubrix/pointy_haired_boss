# Host integration evidence

PHB-012, September 19, 2026. **Partial:** host contracts and DSH service behavior have evidence; full interactive invocation, resume, and compaction do not. No PHB plugin is installed in a user host yet.

| Host | Observed version | Evidence obtained | Still required |
| --- | --- | --- | --- |
| Codex CLI | 0.154.0 | Installed version/help; official plugin and hook contracts; local scaffold-validator contract | Packaged skill discovery, trusted/untrusted hooks, live invocation, on/off, isolation, resume, compaction |
| Claude Code | 2.1.278 | Installed version/help; native `plugin validate --json --strict` command available; official plugin/hook contracts | Run validator on the real adapter; live invocation, on/off, isolation, resume, compaction |
| Confirmed DSH wrapper | DSH packages 0.1.6-alpha.1; Cordis 4.0.2 | Eight passing service/event checks using the wrapper's installed libraries | Host UI invocation, effective wrapper skill roots, durable state, resume/compaction, output enforcement |

The DSH evidence comes from `/Users/mark/code/scratch/homebrew-qwen-dsh/runtime`. The global `dsh` executable and a separate source checkout have older versions and do not establish compatibility with this wrapper.

## Adapter contract

Keep a canonical skill/policy and package separate host manifests and lifecycle configuration. Each adapter must report the features it supports and which checks have completed. Hook configuration similarity is insufficient evidence of matching lifecycle behavior.

Codex packaging uses `.codex-plugin/plugin.json` and bundled skills. Use the default `hooks/hooks.json` location: the local plugin-creator validator rejects a manifest-level `hooks` field. Review exact hook definitions through the host's trust mechanism. An untrusted hook means automatic guidance is unavailable until trust is established. Keep manual invocation discoverable. [OpenAI packaging documentation](https://developers.openai.com/plugins/build/plugins), [Codex hooks](https://learn.chatgpt.com/docs/hooks).

Claude Code uses `.claude-plugin/plugin.json`, `skills/`, and `hooks/hooks.json`. `--plugin-dir` provides a development loading path; `claude plugin validate --json --strict <path>` provides static validation. Validation alone cannot establish that a hook ran or that the model followed its guidance. [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference).

For both hosts, investigate `SessionStart`, `UserPromptSubmit`, and compaction events to refresh the short policy. Their hook outputs can carry event-specific context, but each adapter must use its own supported event schema. Write/stop checks need a bounded recursion guard, a clear file scope, and status that distinguishes a delivered response from a checked artifact. [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code hooks](https://code.claude.com/docs/en/hooks).

Disabling future injection does not erase policy text already in the conversation. PHB's off switch must supersede earlier plugin guidance and verify the effect on the next turn. Restoring a mode must preserve user-selected intensity/profile without reviving another session's state. These are implementation requirements, not proven behavior.

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

The wrapper's `lib/ninjaai.py` seeds skills into `~/.gsd/agent/skills`. The installed filesystem provider's default project/user roots use `.dsh` and `.agents`, with additional roots available through `customSkillDirs`. The fixture proves that this seed location needs an explicit discovery path; it does **not** prove the user's effective wrapper configuration is broken. The adapter should register its bundled skill through the registry or configure its own explicit root, then test the loaded wrapper composition.

Installed declarations establish `agent/pre-step` as a waterfall that returns `{kind: "enter", messages}` or `{kind: "reject"}`. The probe uses `createUserMessage` with `source.form: "instructions"`. `agent/request` returns a frozen call configuration; its contract forbids using it to mutate model-visible messages. Use the logged instruction/message path and preserve scoped event routing.

Source evidence under the wrapper runtime:

- `node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`: registry, providers, invocation controls, and disposal.
- `node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js`: roots, `customSkillDirs`, parsing, and loading.
- `node_modules/@deepseek-ai/dsh-scope/lib/types/index.d.ts`: scoped registrations and event carriers.
- `node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`: pre-step and request contracts.
- `node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js`: existing durable instruction projection.

These are primary installed sources for the pinned [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime. The probe dispatches synthetic events; it does not instantiate the full agent loop or prove persistence. Its one-batch duplicate guard is insufficient for production cross-turn state, cancellation, replay, or compaction. Those cases remain part of PHB-012 and the adapter tasks.
