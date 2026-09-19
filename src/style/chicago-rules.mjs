// Public guidance checked 2026-09-19. Source edition is explicit: a 17th-edition
// Q&A is not evidence that we independently checked the corresponding 18th text.
export const chicagoRules = [
   { id: 'CMO-01/em-dash-spacing', ruleId: 'CMO-01', title: 'Spaces around an interior em dash', sourceEdition: 17,
      reference: 'https://www.chicagomanualofstyle.org/qanda/data/faq/topics/HyphensEnDashesEmDashes/faq0114.html',
      guidance: 'Chicago normally closes up an interior em dash.',
      exceptions: 'Display typography and an explicit house convention can differ; this check does not ban em dashes.' },
   { id: 'CMO-02/colon-sentence-capital', ruleId: 'CMO-02', title: 'Sentence capitalization after a colon', sourceEdition: 18,
      reference: 'https://www.chicagomanualofstyle.org/help-tools/what-s-new.html',
      guidance: 'CMOS 18, 6.67 capitalizes a complete sentence after a colon.',
      exceptions: 'Fragments, labels, quoted source text, and proper names need context. The detector only screens a pronoun followed by a listed finite verb.' },
   { id: 'CMO-03/ebook-spelling', ruleId: 'CMO-03', title: 'Closed spelling of ebook', sourceEdition: 18,
      reference: 'https://www.chicagomanualofstyle.org/help-tools/what-s-new.html',
      guidance: 'CMOS 18, 7.96 prefers the closed spelling ebook.',
      exceptions: 'Retain exact titles, brands, terminology, and source quotations.' },
   { id: 'CMO-04/month-day-cardinal', ruleId: 'CMO-04', title: 'Cardinal day after a month', sourceEdition: 18,
      reference: 'https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Numbers/faq0083.html',
      guidance: 'Use a cardinal day in a month-first date; preserve its value.',
      exceptions: 'A day before the month or used alone can be ordinal. The detector does not validate dates or infer missing years.' },
   { id: 'CMO-05/latin-abbreviation-comma', ruleId: 'CMO-05', title: 'Comma after e.g. or i.e.', sourceEdition: 17,
      reference: 'https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Abbreviations/faq0047.html',
      guidance: 'Chicago punctuates e.g. and i.e. with a following comma.',
      exceptions: 'A literal abbreviation being named, rather than used, needs no inserted comma. Consider English wording in running prose.' },
   { id: 'CMO-06/quotation-punctuation', ruleId: 'CMO-06', title: 'Comma or period outside a closing quotation', sourceEdition: 18,
      reference: 'https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Punctuation/faq0135.html',
      guidance: 'Chicago generally places commas and periods inside closing quotation marks.',
      exceptions: 'Preserve exact quotation content and citation facts. This finding covers only the outside punctuation and cannot authorize moving it into a protected quotation.' },
];
for (const rule of chicagoRules) Object.freeze(rule);
Object.freeze(chicagoRules);
