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

// ---------------------------------------------------------------------------------------------
// A yes only answers a question that a yes can answer (25ab), and an explicit ask to draw needs no
// question at all (25ac). Both lean towards asking again, which costs one sentence.

const YES_OR_NO = /\b(?:yes or no|or not|sim ou n[aã]o|ou n[aã]o|s[ií] o no|o no)\b/giu;
const AN_ITEM = /^\s*(?:\d+[.)]|[-*•])\s/gmu;
const MORE_THAN_ONE =
  /\b(?:or|ou|either|one of|any of|which one|which do|which would|which of|qual deles|qual prefere|cu[aá]l)\b/iu;
/** In Portuguese "o" is "the", so it only means "or" in a sentence that opens with ¿. */
const SPANISH_OR = /¿.*\so\s/su;

/** Whether what the agent last said leaves one thing for a yes to agree to. */
export function askedYesOrNo(said: string): boolean {
  const text = said.replace(YES_OR_NO, ' ');
  if ((text.match(AN_ITEM) ?? []).length > 1) return false;
  const last = text.match(/[^.!?\n]*\?/gu)?.at(-1);
  return !last || !(MORE_THAN_ONE.test(last) || SPANISH_OR.test(last));
}

/** Said before the verb, these change nothing. */
const LEADS = new Set(
  "please pls ok okay so now then just hey hi hello and also alright well um uh yes yeah yep sim si sure go ahead let's lets por favor vamos".split(
    ' ',
  ),
);
const DRAWS =
  /^(?:draw|redraw|sketch|plot|map|render|visuali[sz]e|desenh[ae]|desenhar|mapeia|visualiza|dibuj[ae]|dibujame|dibujar)\b/u;
/** These only ask for a drawing when a flower or a map is what they name. */
const MAKES =
  /^(?:make|create|build|generate|give|show|i want|i need|i'd like|id like|i would like|faz|faca|cria|crie|gera|monta|mostra|quero|haz|hazme|crea|genera|muestra|quiero)\b/u;
const A_DRAWING = /\b(?:flower|flor|map|mapa)\b/u;
const NOT_NOW =
  /\b(?:not yet|later|maybe|perhaps|tomorrow|unless|if|before|wait|whether|but first|depois|talvez|quizas)\b/u;
/** With nothing but these left, nothing was named. */
const NAMES_NOTHING = new Set(
  'me us a an the it that this them these those one ones again flower flor map mapa please now'.split(
    ' ',
  ),
);

function saysDraw(sentence: string): boolean {
  if (/[?¿？]/u.test(sentence)) return false;
  const words = wordsOf(sentence);
  let at = 0;
  while (LEADS.has(words[at] ?? '')) at++;
  const rest = words.slice(at).join(' ');
  const verb = DRAWS.exec(rest)?.[0] ?? (A_DRAWING.test(rest) ? MAKES.exec(rest)?.[0] : undefined);
  if (!verb || NOT_NOW.test(rest)) return false;
  return wordsOf(rest.slice(verb.length)).some((w) => !NAMES_NOTHING.has(w));
}

/** "Draw me…", "Let's make the … flower": told to, not asked about. "Who holds X?" is a question. */
export function asksToDraw(text: string): boolean {
  return text.split(/(?<=[.!?。])\s+|\n+/u).some(saysDraw);
}
