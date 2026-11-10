// The composer's model picker: what it says, what can be picked, and what a pick brings with it.
import { describe, expect, test } from 'vitest';
import {
  type Catalogue,
  modelOptions,
  modelPill,
  type Settings,
  withModel,
} from '../lib/composer-options.ts';

const flash = {
  id: 'flash',
  name: 'DeepSeek V4.1 Flash',
  promise: 'signed' as const,
  runs_at: 'NEAR AI’s enclave',
  default_effort: 'low',
  usd_per_flower: 0.0205,
  usd_per_turn: 0.012,
};
const haiku = {
  id: 'haiku',
  name: 'Claude Haiku 5.5',
  promise: 'passed_through' as const,
  runs_at: 'Anthropic',
  default_effort: null,
  usd_per_flower: 0.007,
  usd_per_turn: null,
};
const settings: Settings = {
  provider: 'near-ai',
  model: 'flash',
  effort: 'low',
  permissions: 'ask',
};
const catalogue: Catalogue = {
  default: settings,
  providers: [{ id: 'near-ai', models: [flash, haiku] }],
};

describe('the pill', () => {
  test('says what’s picked', () => {
    expect(modelPill(catalogue, settings, null)).toBe('DeepSeek V4.1 Flash');
    expect(modelPill(catalogue, settings, 'flash')).toBe('DeepSeek V4.1 Flash');
  });

  test('says which model really answered, when it isn’t that', () => {
    expect(modelPill(catalogue, { ...settings, model: 'haiku' }, 'flash')).toBe(
      'Claude Haiku 5.5  ·  ran DeepSeek V4.1 Flash',
    );
  });

  test('a model the catalogue doesn’t know goes by its id', () => {
    expect(modelPill(catalogue, settings, 'other/model')).toBe(
      'DeepSeek V4.1 Flash  ·  ran other/model',
    );
  });
});

describe('what can be picked', () => {
  test('the provider’s models, what each promises, what a measured turn costs, and which is on', () => {
    expect(modelOptions(catalogue, settings, 3.6)).toEqual([
      {
        id: 'flash',
        label: 'DeepSeek V4.1 Flash',
        sub: 'Signed  ·  NEAR AI’s enclave  ·  $0.012\u00a0a\u00a0turn\u00a0·\u00a00.003\u00a0NEAR',
        on: true,
      },
      {
        id: 'haiku',
        label: 'Claude Haiku 5.5',
        sub: 'Passed through  ·  Anthropic',
        on: false,
      },
    ]);
  });

  test('with no price for NEAR, a turn’s cost in dollars alone', () => {
    expect(modelOptions(catalogue, settings, null)[0]?.sub).toBe(
      'Signed  ·  NEAR AI’s enclave  ·  $0.012\u00a0a\u00a0turn',
    );
  });
});

describe('a pick', () => {
  test('brings the model’s own effort, or none', () => {
    expect(withModel(catalogue, settings, 'haiku')).toEqual({
      ...settings,
      model: 'haiku',
      effort: null,
    });
    expect(
      withModel(catalogue, { ...settings, model: 'haiku', effort: null }, 'flash').effort,
    ).toBe('low');
  });
});
