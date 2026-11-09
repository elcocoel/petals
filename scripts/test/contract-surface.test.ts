// packages/v1 (contracts/packages.md): every runtime export the contract names exists.
// Types are checked by `tsc -b`. Removing or renaming one of these is a contract change.
import * as agent from '@petal/agent';
import * as core from '@petal/core';
import * as inputs from '@petal/inputs';
import * as auth from '@petal/near/auth';
import * as map from '@petal/near/map';
import * as pay from '@petal/near/pay';
import * as tools from '@petal/tools';
import { describe, expect, test } from 'vitest';

const surface: [string, Record<string, unknown>, string[]][] = [
  [
    '@petal/core',
    core,
    [
      'applyPolicy',
      'claimerRecord',
      'claimsFromMap',
      'DEFAULT_LENS',
      'observedClaims',
      'validateClaim',
      'schemas',
      'canonicalJson',
      'sha256Hex',
      'specHash',
      'entryId',
      'signedPart',
      'validateSnapshot',
      'validateSpec',
      'computeFigures',
      'selectPetals',
      'backerSegments',
      'compareFigures',
      'PRIMITIVES',
      'DEFAULT_CONVENTION',
      'buildSpec',
      'renderFlower',
      'readFlower',
      'readingHash',
      'SKINS',
      'recipeOf',
      'recipeHash',
      'choicesFromSpec',
      'diffSpecs',
    ],
  ],
  ['@petal/inputs', inputs, ['modules', 'fileStore', 'getSnapshot', 'importSpike']],
  ['@petal/near/map', map, ['fastDataWriter', 'fastDataReader', 'mirror', 'fakeMap', 'mapKeys']],
  ['@petal/near/auth', auth, ['issueNonce', 'verifyNep413']],
  ['@petal/near/pay', pay, ['quote1Click']],
  ['@petal/tools', tools, ['registry', 'createContext', 'httpApp', 'mcpServer', 'serveStdio']],
  [
    '@petal/agent',
    agent,
    [
      'runAgent',
      'nearAiClient',
      'recordedClient',
      'SYSTEM_PROMPT',
      'fileRunStore',
      'agentRoutes',
      'petalApp',
    ],
  ],
];

describe('packages/v1 surface', () => {
  test.each(surface)('%s', (_name, mod, names) => {
    for (const n of names) expect(mod[n], n).toBeDefined();
  });

  test('mapKeys has a builder for every key in shared-map.md', () => {
    expect(Object.keys(map.mapKeys).sort()).toEqual(
      ['correction', 'index', 'label', 'snapshot', 'spec', 'vouch'].sort(),
    );
  });

  test('versions', () => {
    expect(core.VERSIONS).toEqual({
      packages: 'packages/v1',
      tools: 'tools/v2',
      api: 'api/v1',
      map: 'map/v2',
      render: 'render/v1',
      reading: 'reading/v1',
      recipe: 'recipe/v1',
      convention: 'default/v1',
      claim: 'claim/v1',
      view: 'view/v1',
    });
  });

  test('PRIMITIVES declares the whole vocabulary (FR-032)', () => {
    expect(core.PRIMITIVES.map((p) => p.id).sort()).toEqual(
      [
        'width',
        'height',
        'segments',
        'colour',
        'outline',
        'order',
        'lines',
        'markings',
        'texture',
        'extrusion',
        'opacity',
      ].sort(),
    );
    for (const p of core.PRIMITIVES) expect(['available', 'unavailable']).toContain(p.status);
  });

  test('DEFAULT_CONVENTION is default/v1 with the order the contract names', () => {
    expect(core.DEFAULT_CONVENTION.id).toBe('default/v1');
    expect(core.DEFAULT_CONVENTION.encodings.order).toEqual({
      by: 'measure_desc',
      meaning: 'largest first, clockwise from the top',
    });
    expect(core.DEFAULT_CONVENTION.encodings.width.max_ratio).toBe(2);
  });

  test('stubs throw NotImplementedError with code not_implemented', () => {
    expect(new core.NotImplementedError('x').code).toBe('not_implemented');
    expect(() => core.notImplemented('x')).toThrow(core.NotImplementedError);
  });
});
