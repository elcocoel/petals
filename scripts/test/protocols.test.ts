// The protocols' check (specs/protocols.md) holds on the repo, and catches what it's for: a fixture that
// changed, a version whose schema went, a fixture nobody pinned, an id that isn't versioned.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemas } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { protocolProblems, SCHEMA_DIR } from '../check-protocols.ts';

const copy = () => {
  const dir = mkdtempSync(join(tmpdir(), 'petal-protocols-'));
  cpSync(SCHEMA_DIR, dir, { recursive: true });
  return dir;
};

describe('the protocols check', () => {
  test('holds on the repo', () => {
    expect(protocolProblems()).toEqual([]);
  });

  test('a fixture that changed breaks its pin', () => {
    const dir = copy();
    const file = join(dir, 'fixtures', 'spec.v1.json');
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    doc.title = `${doc.title} (changed)`;
    writeFileSync(file, JSON.stringify(doc));
    expect(protocolProblems(dir).join('\n')).toMatch(/spec\.v1\.json: its hash is/);
  });

  test('a version that was pinned keeps its schema', () => {
    const { claim: _gone, ...rest } = schemas as Record<string, object>;
    expect(protocolProblems(SCHEMA_DIR, rest).join('\n')).toMatch(/claim:v1 is gone/);
  });

  test('a fixture nobody pinned, and a schema with no fixture, are both caught', () => {
    const dir = copy();
    writeFileSync(join(dir, 'fixtures', 'stray.json'), '{}');
    const pins = JSON.parse(readFileSync(join(dir, 'pins.json'), 'utf8'));
    delete pins['claim.v1.json'];
    writeFileSync(join(dir, 'pins.json'), JSON.stringify(pins));
    const problems = protocolProblems(dir).join('\n');
    expect(problems).toMatch(/fixtures\/stray\.json isn't pinned/);
    expect(problems).toMatch(/claim:v1 has no pinned fixture/);
  });

  test('an id that names no version is refused', () => {
    const bad = { ...(schemas as Record<string, object>), odd: { $id: 'urn:petal:schema:odd' } };
    expect(protocolProblems(SCHEMA_DIR, bad).join('\n')).toMatch(/odd: its \$id/);
  });
});
