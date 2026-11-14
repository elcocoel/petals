// Every turn says what is in front of the person on /make's canvas (ChatInput.in_front): the map they're inside,
// the flower drawn apart, the layers on where some are off, and what's chosen. And the chat sends it.
import type { AgentEvent } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import type { ChatRequest } from '../lib/agent-client.ts';
import { type CanvasFront, inFrontOf } from '../lib/in-front.ts';
import { type ChatDeps, sendQuestion } from '../viewmodels/useMakeChat.ts';

const MARINADE = 'near:mainnet:marinade.near';
const nothing: CanvasFront = {
  onMap: true,
  entered: null,
  flower: null,
  layers: null,
  wallet: null,
  proposal: null,
};

describe('in front of the person', () => {
  test('the whole Power Map, no map entered', () => {
    expect(inFrontOf(nothing)).toEqual({ map: null });
  });

  test('the map the person is inside', () => {
    expect(inFrontOf({ ...nothing, entered: MARINADE })).toEqual({ map: MARINADE });
  });

  test('a flower drawn apart from the map is named by its spec', () => {
    const sha = 'a'.repeat(64);
    expect(inFrontOf({ ...nothing, onMap: false, entered: MARINADE, flower: sha })).toEqual({
      map: null,
      flower: sha,
    });
  });

  test('the layers still on go only with their own map, and only when some are off', () => {
    const on = ['b'.repeat(64)];
    expect(inFrontOf({ ...nothing, entered: MARINADE, layers: { map: MARINADE, on } })).toEqual({
      map: MARINADE,
      layers: on,
    });
    expect(inFrontOf({ ...nothing, entered: 'other', layers: { map: MARINADE, on } })).toEqual({
      map: 'other',
    });
  });

  test('a chosen wallet is selected in the show shape, before a pinned proposal', () => {
    const wallet = { id: 'alice.near', chain: 'near:mainnet' };
    const proposal = { map: MARINADE, id: '42' };
    expect(inFrontOf({ ...nothing, entered: MARINADE, wallet, proposal })).toEqual({
      map: MARINADE,
      selected: { wallet: 'alice.near', chain: 'near:mainnet' },
    });
    expect(inFrontOf({ ...nothing, entered: MARINADE, proposal })).toEqual({
      map: MARINADE,
      selected: { proposal },
    });
  });
});

describe('the chat sends it', () => {
  const run: AgentEvent = { event: 'run', data: { run_id: 'r1', resume_url: '/make?run=r1' } };
  const sent = async (q: Parameters<typeof sendQuestion>[1]) => {
    const asked: ChatRequest[] = [];
    const deps: ChatDeps = {
      client: {
        async *chat(r) {
          asked.push(r);
          yield run;
        },
        readRun: () => Promise.reject(new Error('unused')),
        followRun: () => {
          throw new Error('unused');
        },
      },
      store: null,
      dispatch: () => {},
      onRun: () => {},
    };
    await sendQuestion(deps, q);
    return asked;
  };

  test('with every turn, beside the words', async () => {
    const inFront = { map: MARINADE };
    const [req] = await sent({
      text: 'what is this about?',
      recorded: false,
      runId: null,
      inFront,
    });
    expect(req?.in_front).toEqual(inFront);
    expect(req?.messages.at(-1)?.content).toBe('what is this about?');
  });

  test('not on a recorded run, which plays its own saved question', async () => {
    const [req] = await sent({
      text: 'x',
      recorded: true,
      runId: null,
      inFront: { map: MARINADE },
    });
    expect(req && 'in_front' in req).toBe(false);
  });
});
