// The lab never answers on the public site: on Vercel every /lab page is a 404, even with PETAL_LAB=1.
import { afterEach, expect, test } from 'vitest';
import LabLayout from '../app/lab/layout.tsx';

const was = { VERCEL: process.env.VERCEL, PETAL_LAB: process.env.PETAL_LAB };
afterEach(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('on Vercel the lab is a 404, whatever PETAL_LAB says', () => {
  process.env.VERCEL = '1';
  process.env.PETAL_LAB = '1';
  expect(() => LabLayout({ children: 'lab' })).toThrow();
});

test('off Vercel the lab pages keep their own rule', () => {
  delete process.env.VERCEL;
  expect(LabLayout({ children: 'lab' })).toBe('lab');
});
