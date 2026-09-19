# Readability and Chicago review

`phb check` now reports a Flesch–Kincaid estimate and six narrow Chicago review checks. It remains read-only. All four house bans stay active; a Chicago convention cannot override them or authorize changes to facts, quotations, or citation fields.

```sh
node bin/phb.mjs check --format json draft.md
node bin/phb.mjs check --require READ-01 --threshold warning draft.md
```

The second command requires a usable metric. It returns `1` for an above-target warning, `2` when measurement is unavailable, and `0` when that requested scope passes. The default required scope remains boundaries, LEX-01, and enabled Unicode checks. The default threshold is `error`, so a readability warning appears without changing that default exit to `1`. Chicago candidates remain partial; requiring any CMO family returns `2` until contextual review exists. Neither command certifies comprehension or complete Chicago compliance.

## Counting policy: phb-english-1

The formula is `0.39 × words/sentences + 11.8 × syllables/words − 15.59`. [Microsoft documents these coefficients](https://support.microsoft.com/en-us/outlook/get-your-email-s-readability-and-level-statistics). PHB compares the unrounded result with the configured ceiling, which defaults to `8.0`. Display rounds to two decimals; raw JSON keeps the result, including negative values.

The parser exposes original mapped prose blocks. [parse-english 7.0.0](https://github.com/wooorm/parse-english) segments each body paragraph and list paragraph into sentence/word nodes. PHB replaces soft line wraps with equal-length spaces for analysis; source bytes remain untouched. A sentence unit must end in `.`, `!`, or `?`, optionally followed by a closing parenthesis/bracket. This is a segmentation policy, not proof that each unit is a grammatical sentence. Headings, table cells, and unterminated fragments do not contribute.

Protection excludes the whole affected sentence, preventing shortened fragments from creating a favorable score. This covers inline code, math, quotations, citations, URLs, and locks. Block code/quotes, front matter, HTML, and footnotes are already outside the parser's projected prose. Ordinary link labels and emphasized text remain readable; link destinations and markup do not count as words. A selection contributes only sentence units wholly inside its original range. Any unresolved boundary problem makes the grade unavailable.

[syllable 5.0.1](https://github.com/words/syllable) estimates Latin-script English words, including accented forms, contractions, and hyphenated compounds. A compound/contraction counts as one word under the pinned parser. PHB normalizes curly apostrophes and nonbreaking hyphens in the analysis copy only. Four explicit title pronunciations are supported: Dr., Mr., and Mrs. count as two syllables; Ms. counts as one. Both dependencies use the MIT license; npm's lockfile pins their transitive dependencies. No runtime download or model call occurs.

Numbers, mixed identifiers, unlisted dotted abbreviations, non-Latin words, and all-capital tokens of two or more letters (including a trailing plural `s`) have no declared pronunciation in this version. One such token makes the grade unavailable for the sample; JSON/text reports identify its original span. This avoids inventing readings for a year, an identifier, or an acronym. Preserve these tokens and use contextual review. A broader pronunciation policy remains tracked work. The estimator does not detect whether Latin-script text is English, and proper-name/dialect estimates can be wrong.

The default minimum is 100 eligible words, a project policy rather than a statistically validated reliability threshold. Below it, `status` is `insufficient-sample` and `grade`/`aboveTarget` are `null`. Other unavailable states are `no-eligible-prose`, `unsupported-tokens`, `incomplete-boundaries`, and `disabled`. Scores cover only the reported eligible sample. Never remove substantive text to gain eligibility or lower the grade.

The [readability schema](../schemas/readability.schema.json) records source hash, method/dependency versions, counts, units with original ranges, excluded-unit counts, unsupported tokens, threshold, status, and reason. Exclusion counts for `structure` count blocks; the other counters count sentence units. Protected block types omitted by the parser appear in the document's boundary inventory, not those counters. Each excluded unit gets its first applicable reason. Fully suppressed READ-01 sentence units leave the metric sample; partial overlaps do not. Configured path/document suppressions retain the metric but suppress an above-target finding with a reason. `allowedTerms` affects lexical bans, not syllable counts or Chicago review.

An above-target READ-01 finding confirms the computed estimate, not that the author or reader lacks ability. It carries no fix. The finding anchors at the first unsuppressed measured word; `readability.units` explains the document-level sample. A word-level exemption cannot suppress the whole metric warning; a unit whose every word has an explicit exemption leaves the sample. Requirements and rule IDs are separate namespaces: rule READ-01 implements the metric in requirement READ-02. Contextual readability requirement READ-01 remains part of the future editorial workflow.

## Declared Chicago subset

The general reference edition is Chicago 18. Each check records the edition of the public guidance actually consulted. Four checks use explicit 18th-edition guidance. Two use identified 17th-edition Q&As; PHB does not claim independent verification of their subscription-only 18th-edition counterparts. No manual text is bundled. The [machine-readable definitions](../src/style/chicago-rules.mjs) and [output schema](../schemas/chicago.schema.json) expose the source and exceptions.

| Family / local check | Candidate and exceptions | Checked source |
| --- | --- | --- |
| CMO-01 / em-dash-spacing | Horizontal whitespace around an interior em dash between letters/numbers. Review display typography or house conventions. No em-dash ban. | [17th-edition Q&A](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/HyphensEnDashesEmDashes/faq0114.html); [typographic discretion](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Punctuation/faq0048.html) |
| CMO-02 / colon-sentence-capital | A lowercase pronoun plus a listed finite verb after a colon, through terminal punctuation in a body segment. A reviewer must confirm a complete sentence. Headings, table labels, and other sentence openings are outside this detector. | [18th-edition changes, 6.67](https://www.chicagomanualofstyle.org/help-tools/what-s-new.html) |
| CMO-03 / ebook-spelling | The separate word `e-book` or `e-books`, case-insensitive. Preserve exact names, titles, brands, and source wording through protection/suppression. | [18th-edition changes, 7.96](https://www.chicagomanualofstyle.org/help-tools/what-s-new.html) |
| CMO-04 / month-day-cardinal | A full capitalized month name followed by an ordinal day from 1 through 31. A day alone or before a month stays outside this detector. No date validation, changed values, or inferred year. | [18th-edition Q&A](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Numbers/faq0083.html) |
| CMO-05 / latin-abbreviation-comma | Lowercase `e.g.` or `i.e.` followed by horizontal whitespace and a letter/number. A literal abbreviation being named can be an exception; consider English wording in running prose. | [17th-edition Q&A](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Abbreviations/faq0047.html) |
| CMO-06 / quotation-punctuation | A literal comma/period immediately after a recognized closing quotation, if that punctuation is editable prose. The span covers only the outside punctuation. Moving it into a protected quote requires a fidelity decision; there is no patch. | [18th-edition Q&A](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Punctuation/faq0135.html) |

These are heuristic candidates at the configured family severity. Even a clean local result leaves all six families partial. Full title case, spelling dictionaries, general compounds, number/unit style, abbreviation expansion, citation-system consistency, and bibliographic validation remain unsupported. Existing protected citations keep their exact facts and notation. Other constructions, encoded outside punctuation, and context-dependent exceptions need the editorial workflow or manual reference.

Use family severity settings or documented suppressions for house exceptions. The shared precedence rules apply; no CMO check changes a ban's severity, citation system, or user configuration. All tests use original fixtures and leave source prose intact. [project.org](../project.org) records runtime checks, corpus gaps, and remaining host/editorial work.
