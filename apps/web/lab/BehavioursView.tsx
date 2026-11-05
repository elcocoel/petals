'use client';
// What version 2 added, read from where it's defined: the behaviour tree and the tokens. Only shown at a
// version that has them, so with `?v=1` the lab is the lab at tag system-v1.
import { behaviours, parentOf, parents, tokenName, v2 } from '@petal/tokens';
import { useSyncExternalStore } from 'react';

function watchVersion(changed: () => void) {
  const watch = new MutationObserver(changed);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-version'] });
  return () => watch.disconnect();
}

const readVersion = () => document.documentElement.dataset.version ?? null;

const valueLine = (value: string | Record<string, string>) =>
  typeof value === 'string'
    ? value
    : Object.entries(value)
        .map(([surface, css]) => `${surface}: ${css}`)
        .join('\n');

const short = (text: string) => (text.length > 160 ? `${text.slice(0, 160)}…` : text);

export function BehavioursView() {
  const version = useSyncExternalStore(watchVersion, readVersion, () => null);
  if (version === null || version === '1') return null;
  return (
    <div className="flex flex-col gap-block-gap">
      <h3 className="m-0">Version {v2.id}: behaviours</h3>
      <table>
        <thead>
          <tr>
            <th>Parent</th>
            <th>Child</th>
            <th>Purpose</th>
            <th>Lives in</th>
          </tr>
        </thead>
        <tbody>
          {behaviours.map(({ name, purpose, via }) => (
            <tr key={name}>
              <td className="type-mono">{parentOf(name)}</td>
              <td className="type-mono">{name}</td>
              <td>{purpose}</td>
              <td className="type-mono">{via}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="type-mono text-muted">
        Parents: {Object.keys(parents).join(', ')}. Compare with ?v=1 or the key v. Turn one off
        with ?off=field,box.
      </p>
      <h3 className="m-0">Version {v2.id}: tokens</h3>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Token</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(v2.groups).flatMap(([group, values]) =>
            Object.entries(values).map(([name, value]) => (
              <tr key={`${group}.${name}`}>
                <td className="type-mono">{group}</td>
                <td className="type-mono">{tokenName(group, name)}</td>
                <td className="type-mono whitespace-pre-wrap">{short(valueLine(value))}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
