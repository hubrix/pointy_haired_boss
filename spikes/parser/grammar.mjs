import nlp from 'compromise';

export function grammarCandidates(source) {
   const document = nlp(source);
   return {
      adverbs: document.adverbs().json().flatMap((phrase) => phrase.terms
         .filter((term) => term.tags.includes('Adverb')).map((term) => term.text)),
      passive: document.verbs().json().some((phrase) => phrase.verb?.grammar?.passive === true),
   };
}
