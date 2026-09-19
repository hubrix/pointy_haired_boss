# Initial rule catalog

Policy design with an implemented [versioned metadata catalog](../rules/catalog.json) and [shared contracts](CONTRACTS.md). Detector implementation remains separate work. Examples are original. The catalog draws on [RESEARCH.md](RESEARCH.md) and distinguishes explicit preferences from contextual editorial judgments.

Default levels: `error` blocks a checked artifact at the configured threshold; `warning` requests review; `suggestion` is optional. A match outside editable prose is suppressed or reported as a protected-content conflict. No rule establishes AI authorship.

Mark's house rules are defaults: no adverbs, no passive voice, no “this, not that” framing, no agentless obligations; target eighth-grade readability and follow Chicago where these rules do not override it. Protected quotations and exact text remain intact. A conflict with meaning produces an unresolved finding, not a silent exception.

## Required rule record

Each rule stores an ID, version, category, title, rationale, source references, default severity, detector type, scopes, match or judgment criteria, exception criteria, fix policy, and positive/negative fixtures. Detector types are `exact`, `heuristic`, and `semantic`, with optional grammar/metric subtypes. Fix policies are `safe-local`, `editorial-review`, and `report-only`. Requirement IDs and rule IDs belong to separate namespaces; findings use rule IDs.

Confidence is a qualitative evidence label, not a fabricated probability. Exact detection does not imply that automatic replacement is safe. Fixes must use exact source preconditions and respect protected spans.

## Style and structure

| ID | Pattern | Default / detector | Example and treatment | Exception |
| --- | --- | --- | --- | --- |
| LEX-01 | User-forbidden vocabulary or phrases | Error / exact | A configured ban on “delve into” produces a finding with its exact span; revise in context | Quotes, required names/terms, explicit allowlist |
| LEX-02 | Empty introductory wording | Warning / heuristic | “It is worth noting that the build failed.” → “The build failed.” | A phrase discussed as an example |
| LEX-03 | Inflated or vague benefit language | Warning / semantic | “A revolutionary workflow unlocks limitless potential.” → flag unsupported benefit; use a supplied concrete benefit if one exists | Supported claim or deliberate advertising register |
| LEX-04 | Wordy verb phrases and nominalizations | Suggestion / heuristic | “We made a decision to postpone.” → “We decided to postpone.” | A noun phrase that is a defined term |
| LEX-05 | Chat residue in standalone prose | Warning / heuristic | Remove “Certainly! Here is your revised memo:” from the memo body | Actual conversational reply or quoted chat |
| LEX-06 | Repeated stock transitions | Warning / heuristic | Several consecutive paragraphs start “Furthermore,” “Moreover,” or “Additionally” | Transition communicates a necessary logical relationship |
| STR-01 | “This, not that” and “not X, but Y” framing | Error / heuristic + semantic | State the intended point without a staged contrast. Cover “not just X,” “more than X,” and contrasts split across sentences | Protect quoted examples; retain any meaningful distinction through a different construction |
| STR-02 | Forced triples or parallel padding | Suggestion / semantic | Three near-synonymous benefits add length without information | A real three-step procedure or three distinct findings |
| STR-03 | Repeated sentence openings and paragraph shape | Suggestion / heuristic + semantic | Repeated templates prompt a contextual review | Deliberate anaphora, comparison table, recurring instructional structure |
| STR-04 | Redundant conclusion or staged dramatic closer | Warning / semantic | A closing sentence merely announces that the previous point matters | Requested executive summary, genuine conclusion, deliberate creative effect |
| STR-05 | Repetition of the same claim across paragraphs | Warning / semantic | Merge restatements while retaining qualifications and distinct evidence | Reader navigation or summary explicitly requested |
| STR-06 | Empty authority or missing substantiation | Warning / semantic | “Experts agree this changes everything.” → flag missing source; do not invent one | Supplied attribution and appropriately scoped claim |
| GRAM-01 | Adverbs | Error / grammatical + semantic | “Maya quickly finished.” → “Maya finished,” if speed adds no meaning; otherwise express the supported speed without an adverb | Protected text; meaning-bearing adverbs require a faithful recast or an unresolved conflict |
| CLR-01 | Passive voice | Error / grammatical + semantic | “The report was approved by Maya.” → “Maya approved the report.” | Protected text; unknown actor is a missing-information finding, not permission to invent one |
| CLR-02 | Buried main point | Warning / semantic | Move the supplied decision ahead of background when it helps the reader | Narrative suspense or required document template |
| CLR-03 | Unexplained jargon or ambiguous reference | Suggestion / semantic | Clarify what “this” refers to using existing context | Term is appropriate for the named specialist audience |
| CLR-04 | Dense sentence or paragraph | Suggestion / heuristic + semantic | Length triggers inspection; split only if the logical relationship survives | Clear complex argument; meaningful longer sentence |
| CLR-05 | Agentless obligation | Error / semantic | “Approval is required before launch.” → “The release manager must approve the launch,” only when the source identifies that owner | A direct instruction has an unambiguous addressee; otherwise name the owner or flag the gap |
| READ-01 | Reading burden above eighth-grade target | Warning / metric + semantic | Compute Flesch–Kincaid on eligible body prose; simplify sentence structure and explain jargon | Protect essential facts and terms; report insufficient sample below the configured minimum |
| FMT-01 | Overused punctuation or decorative formatting | Suggestion / heuristic | Clustered dashes, bold labels, or emoji prompt review | Author profile, useful emphasis, scanning/navigation |
| FMT-02 | Unnecessary headings and list fragmentation | Suggestion / semantic | A heading adds no navigation or repeats the following sentence | Procedures, comparisons, accessibility, requested format |

Do not ban whole word families by substring. A ban on a standalone term must not match an unrelated longer word. Phrase matching needs a defined case and whitespace policy; morphology expansion must be explicit. Required terminology and user suppressions take precedence over generic vocabulary advice.

The default house profile makes GRAM-01, CLR-01, CLR-05, and STR-01 errors; LEX-01 becomes an error for configured phrase bans. Contextual confirmation controls whether a candidate is a violation, not whether the ban applies. All intensity levels keep these defaults. Other profiles require an explicit user choice to relax them.

### Grammar and responsibility detection

- Detect adverbs by grammatical function, including forms without an `-ly` ending. Avoid suffix-only matching: “friendly” can be an adjective, while “often” is an adverb. The implementation must define its treatment of negation, particles, degree, time, and sentence adverbs in fixtures. Treat meaning-bearing cases as recast-or-conflict, not delete-on-sight.
- Detect passive constructions with auxiliary chains and participles, including get-passives. “The server is ready” is not passive; “Maya has finished” is active perfect. Do not ban forms of “be” as a proxy.
- Inspect obligations beyond passive voice: “It is necessary to review,” “There needs to be approval,” “The requirement is to review,” and “The report needs a review” can omit the responsible actor.
- Accept “Submit your report by Friday” when the document addresses the person who must submit it. Accept “The review team must approve the release.” Flag an unresolved “we” when the audience/context does not identify the group.
- Keep modality: do not change “should” into “must” or a permission into a duty while naming the actor.
- Replace rhetorical contrast without deleting operational distinctions. “Use staging credentials. Keep production credentials out of tests” can preserve a supplied credential restriction. Ordinary negation and factual comparison are not automatically the banned rhetorical device.

The `grammatical` label above is a subtype of a heuristic detector until contextual review confirms the finding. Reports must show that distinction.

## Chicago coverage

The first release must implement and document a source-checked subset of Chicago's 18th edition. These are rule families to refine into testable subrules during implementation, not claims that all Chicago guidance has been encoded.

| ID | Family | Intended checks |
| --- | --- | --- |
| CMO-01 | Punctuation | Serial-comma and quotation-punctuation policy, apostrophes, and consistent dash/ellipsis treatment |
| CMO-02 | Capitalization and titles | Names, titles of works, and selected heading style; preserve proper names |
| CMO-03 | Spelling and compounds | US spelling baseline, hyphenation and compound consistency, domain vocabulary |
| CMO-04 | Numbers | Context-appropriate numeral/spelled-out forms, ranges, and consistent presentation; preserve values and units |
| CMO-05 | Abbreviations | Consistent abbreviation forms and useful first-use expansion using supplied definitions |
| CMO-06 | Quotations and citations | Quotation treatment and consistency within the document's chosen citation system; preserve source content and citation facts |

Each implemented subrule needs an edition, checked source URL/section, original description, exceptions, and fixtures. Use public official guidance or user-provided licensed reference material; do not bundle the manual. Mark unsupported checks as unavailable. House rules prevail over a conflicting Chicago recommendation.

## Fidelity checks

| ID | Check | Failure example | Required response |
| --- | --- | --- | --- |
| FID-01 | Facts and attribution | “12 participants” becomes “20 participants” | Reject candidate |
| FID-02 | Uncertainty, scope, negation, comparison | “May reduce delays in some cases” becomes “Reduces delays” | Reject candidate |
| FID-03 | Unsupported additions | An anecdote, mechanism, quote, opinion, or number appears without a source | Reject candidate in editing mode |
| FID-04 | Protected content | A code fence, citation destination, exact quote, or locked span changes | Reject patch |
| FID-05 | Lost distinctions | Two separate groups or nonconcurrent events are merged into one claim | Reject candidate |
| FID-06 | Voice and register drift | A neutral report becomes slangy, combative, or falsely personal | Revise within the pass budget or return original |

Mechanical checks can catch some violations; semantic review must catch the rest. Report only the checks actually performed. Do not call an automated rewrite “fact checked” merely because names and numbers still match. Creative drafting from an explicit brief has different invention permissions from editing an existing nonfiction draft.

## Unicode and copied-text hygiene

| ID | Detection | Default treatment | Required preservation cases |
| --- | --- | --- | --- |
| UNI-01 | BOM, zero-width spaces, word joiners, soft hyphens | Inventory first; propose removal only for recognized incidental artifacts in eligible prose | Intentional line breaking, byte-order metadata policy, literal examples |
| UNI-02 | ZWJ/ZWNJ and variation selectors | Context-aware inspection; preserve ambiguous cases | Emoji, Arabic/Persian/Indic shaping, valid variation sequences |
| UNI-03 | Bidi marks, embeddings, isolates, and overrides | Show visible annotations; flag suspicious context; no blanket stripping | Mixed-direction prose and legitimate layout |
| UNI-04 | NBSP, narrow NBSP, thin and other spaces | Preserve unless an explicit normalization policy applies | French punctuation, units, nonbreaking expressions |
| UNI-05 | Unicode tag characters and suspicious invisible payloads | Identify sequence and context; remove only policy-approved payloads | Valid emoji tag sequences and quoted Unicode examples |
| UNI-06 | Combining marks, compatibility characters, lookalikes | Report only by default; avoid global normalization | Names, accents, mathematical notation, identifiers |
| ART-01 | Model citation/transport placeholders | Preserve or convert to a real supplied citation; otherwise flag unresolved | Actual source references and literal demonstrations |

Operation example: `re\u200bport` in ordinary English prose can produce a proposed deletion of U+200B after `re`. The report must state which code point changed. It must not say that a statistical watermark was removed. In this document the escaped sequence is an example, not an actual invisible character.

Cleanup preserves original newlines, code spans, and unrelated whitespace. A second cleanup with the same policy produces no further changes. Every lossy normalization must be a distinct, documented opt-in policy.

## Content and distinctions that must survive

- “The estimate may change after the audit.” The uncertainty matters.
- “Robust regression reduced the influence of outliers.” The term is technical.
- “The samples were stored at 4 °C.” The temperature must survive; rewrite if the source identifies the actor, otherwise flag the unresolved passive instead of inventing one.
- “Do not retry a charge after a confirmed success.” Negation is essential.
- “Use the test harness to run the suite.” A flagged word can be exactly right.
- “We support CSV, JSON, and XML.” Three items are three actual formats.
- An emoji family joined by ZWJ; Persian text containing ZWNJ; mixed RTL/LTR text.
- A quotation that contains a forbidden phrase and a paragraph explaining that phrase.
- A valid Markdown procedure with headings, numbered steps, and bold warnings.
- “The server is ready.” Copular syntax is not passive voice.
- “A friendly reviewer approved the memo.” The `-ly` word is an adjective.
- A scope-bearing adverb or negation: preserve its meaning through a recast or report the conflict.
