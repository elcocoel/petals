// What counts as a yes (J4). A message has to be made of these words, or be a plain yes and a few more
// that say which ("yes, the second"), so a qualifier, a negative or a change of subject never slips
// through. When unsure the agent asks again, which is cheap. Tolerant of what voice typing does: casing,
// punctuation, a filler.

const SAYS_YES = new Set([
  'yes',
  'y',
  'yeah',
  'yea',
  'yep',
  'yup',
  'ya',
  'aye',
  'sure',
  'ok',
  'okay',
  'alright',
  'all right',
  'absolutely',
  'definitely',
  'certainly',
  'of course',
  'sounds good',
  'go',
  'go ahead',
  'go on',
  'proceed',
  'continue',
  'carry on',
  'do it',
  'do that',
  'do so',
  'please do',
  "let's do it",
  'lets do it',
  "let's go",
  'lets go',
  'draw',
  'draw it',
  'draw that',
  'draw this',
  // Portuguese and Spanish
  'sim',
  'pode',
  'pode sim',
  'pode ser',
  'pode fazer',
  'pode ir',
  'pode desenhar',
  'claro',
  'com certeza',
  'isso',
  'vai',
  'manda',
  'bora',
  'vamos',
  'faz',
  'faz isso',
  'faca',
  'faca isso',
  'desenha',
  'tudo bem',
  'ta bom',
  'si',
  'dale',
  'adelante',
  'vale',
  'hazlo',
]);

/** Around a yes these change nothing; alone they aren't one. */
const SOFTENERS = new Set([
  'please',
  'thanks',
  'thank you',
  'por favor',
  'obrigado',
  'obrigada',
  'gracias',
  'then',
  'now',
  'just',
  'entao',
  'agora',
  'um',
  'uh',
  'ah',
  'oh',
  'well',
]);

/** Only after one of these can a few more words follow: "ok, the second" may only mean "I see". */
const PLAIN_YES = new Set(['yes', 'yeah', 'yep', 'yup', 'ya', 'sim', 'si']);
const MOST_THAT_SAY_WHICH = 4;
/** Any of these and it's a doubt or a question, however it started. */
const BACKS_OUT = new Set(
  (
    'but however although though wait hold stop not no nope never later maybe perhaps unless if first ' +
    'before what which how why when where who cost mas nao espera talvez pero qual quanto como porque'
  ).split(' '),
);

const LONGEST_PHRASE = 3;
const MAX_WORDS = 8;
const MAX_CHARS = 80;

/** Lower case, without accents or punctuation: what a person said, however it was typed or heard. */
export function wordsOf(text: string): string[] {
  const folded = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('’', "'");
  return folded.match(/[\p{L}\p{N}']+/gu) ?? [];
}

export function isYes(text: string): boolean {
  const said = text.trim();
  if (!said || said.length > MAX_CHARS || /[?¿？]/u.test(said)) return false;
  const words = wordsOf(said);
  if (words.length > MAX_WORDS) return false;
  let yes = false;
  for (let i = 0; i < words.length; ) {
    let matched = 0;
    for (let n = Math.min(LONGEST_PHRASE, words.length - i); n > 0 && !matched; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      if (SAYS_YES.has(phrase)) {
        yes = true;
        matched = n;
      } else if (SOFTENERS.has(phrase)) {
        matched = n;
      }
    }
    if (!matched) {
      const first = words[0] ?? '';
      return (
        PLAIN_YES.has(first) &&
        words.length - i <= MOST_THAT_SAY_WHICH &&
        !words.some((w) => BACKS_OUT.has(w))
      );
    }
    i += matched;
  }
  return yes;
}
