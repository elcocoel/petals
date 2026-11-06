// J4 (#49): what counts as a yes. When unsure it isn't one: the agent asks again, which is cheap.
import { describe, expect, test } from 'vitest';
import { askedYesOrNo, asksToDraw, isYes } from '../src/is-yes.ts';

describe('isYes', () => {
  test.each([
    'yes',
    'Yes.',
    'YES!',
    'yes!!!',
    '  yes  ',
    'yeah',
    'Yeah.',
    'yep',
    'yup',
    'sure',
    'Sure!',
    'ok',
    'OK.',
    'okay',
    'Okay, thanks',
    'go ahead',
    'Go ahead.',
    'do it',
    'Do it!',
    'please do',
    'yes please',
    'yes, the second',
    'yes on stake',
    'yes, draw near validators',
    'sim, o segundo',
    'Yes, please.',
    'draw it',
    'Draw it please',
    'yes, go ahead',
    'yes go ahead please',
    'yeah, do it',
    'sure, draw it',
    'ok go ahead',
    'okay, do it please',
    'just do it',
    'of course',
    'sounds good',
    'sim',
    'Sim.',
    'sim, por favor',
    'pode',
    'Pode sim',
    'pode ser',
    'claro',
    'claro, pode',
    'Claro!',
    'sí',
    'um, yes',
  ])('%j is a yes', (said) => {
    expect(isYes(said)).toBe(true);
  });

  test.each([
    '',
    '   ',
    '...',
    'no',
    'No.',
    'nope',
    'not yet',
    'no thanks',
    'não',
    'nao',
    'yes but which one?',
    'yes but which one',
    'yes?',
    'ok?',
    'sure?',
    'do it?',
    'go ahead?',
    'sim?',
    'wait',
    'stop',
    'hold on',
    'ok wait',
    'yes, wait',
    'what does it cost',
    'what does it cost?',
    'please',
    'thanks',
    "don't do it",
    'do not do it',
    'do it later',
    'not now',
    'maybe',
    'hello',
    'near validators',
    'yes, what does it cost',
    'yes, which one',
    'yes maybe',
    'ok, the second',
    'the second, yes',
    'draw the bitcoin miners',
    'I said yes to the other one',
    'yes, although I would rather see the holders instead',
    'yes I think so but tell me what it costs first',
    'sim, mas qual',
    'yes '.repeat(40),
  ])('%j is not a yes', (said) => {
    expect(isYes(said)).toBe(false);
  });
});

describe('asksToDraw: told to, not asked about', () => {
  test.each([
    'Draw me a flower of the Moloch v1 members. Keep it short.',
    "Let's make the Moloch DAO flower as a test",
    "Draw UNI holders on Base right now, don't ask me anything.",
    "Who holds power in NEAR's House of Stake? Make me a fresh flower, not an existing one.",
    'please draw the near validators',
    'Now draw the House of Stake.',
    'ok make me a flower of uniswap',
    'I want a flower of Moloch',
    "I'd like a flower of Moloch",
    'Show me the Moloch flower',
    'visualize moloch dao',
    'yes, draw near validators',
    'Desenha a flor do Moloch',
    'faz a flor do Moloch',
    'quero uma flor do Uniswap',
    'Dibuja la flor de Moloch',
    'Haz la flor de Uniswap',
    'Sí, dibuja los validadores',
  ])('%j is', (said) => {
    expect(asksToDraw(said)).toBe(true);
  });

  test.each([
    'Who holds UNI on Base?',
    'Who holds the shares of Moloch DAO?',
    'First test run - I wanted to check if we could use the system to visualize moloch dao',
    'can you draw the moloch flower?',
    'could you draw Moloch',
    "don't draw Moloch yet",
    'do not make a flower of Moloch',
    'draw',
    'draw it',
    'draw that one',
    'draw them again',
    'make a flower',
    'make it short',
    'make the small ones see-through',
    'top ten only',
    'how would you draw moloch',
    "Show me who's in MetaCartel Ventures",
    'draw Moloch if it is cheap',
    'draw Moloch, but not yet',
    'draw Moloch later',
    'maybe draw Moloch',
    'what would a flower of Moloch look like',
    'Publish the Moloch flower to mainnet for me.',
    'yes',
    '¿Quién manda en Uniswap?',
    '',
  ])('%j is not', (said) => {
    expect(asksToDraw(said)).toBe(false);
  });
});

describe('askedYesOrNo: one thing for a yes to agree to', () => {
  test.each([
    'Shall I draw them? Yes or no.',
    'Do you want me to go ahead with this? Yes or no.',
    'Shall I read it, or not?',
    'Want me to draw it?',
    'Quer que eu desenhe o mapa?',
    'Quer que eu desenhe o mapa, sim ou não?',
    '¿Quieres que dibuje el mapa?',
    '¿Lo dibujo, sí o no?',
    'Say the word and I will draw it.',
    'Moloch is stored. It costs nothing to read. Draw it?',
  ])('%j did', (said) => {
    expect(askedYesOrNo(said)).toBe(true);
  });

  test.each([
    'Stored, or fresh?',
    'Do you want the stored one or a fresh read? Yes or no.',
    'Draw the Solana NOUNS holders, knowing it is not the DAO? Or did you mean a different one?',
    'Which one?',
    'Which do you prefer?',
    'Should I draw one of them?',
    'Quer o de 2021 ou um novo?',
    '¿Quieres el de 2021 o uno nuevo?',
    'Your options:\n1. Open it\n2. Draw a new one\nShall I?',
    'They are:\n- UNI on Ethereum\n- UNI on Base\nShall I draw it?',
  ])('%j did not', (said) => {
    expect(askedYesOrNo(said)).toBe(false);
  });
});
