// The subscription test rig: what it hands the agent, and how it reads a real run's record.
import { describe, expect, test } from 'vitest';
import {
  agentEnv,
  changesOf,
  claudeArgs,
  codexArgs,
  readClaude,
  readCodex,
  specOf,
} from '../try-agent.ts';

const line = (o: unknown) => JSON.stringify(o);

describe('try-agent', () => {
  test('no key reaches the agent: it bills the subscription, and NEAR AI cannot be spent', () => {
    const env = agentEnv({
      PATH: '/bin',
      HOME: '/h',
      ANTHROPIC_API_KEY: 'x',
      OPENAI_API_KEY: 'x',
      CODEX_API_KEY: 'x',
      NEAR_AI_API_KEY: 'x',
      ENVIO_API_TOKEN: 'x',
      PETAL_WRITER_KEY_FILE: 'x',
      CLAUDECODE: '1',
      CLAUDE_CODE_SESSION_ID: 'x',
    });
    expect(env).toEqual({ PATH: '/bin', HOME: '/h' });
  });

  test('tools and the skill load for this run only, never from the person config', () => {
    const c = claudeArgs('hi', {
      model: 'haiku',
      skill: 'SKILL',
      session: 's',
      first: true,
      state: '/t/.petal',
    });
    expect(c).toContain('--strict-mcp-config');
    expect(c[c.indexOf('--setting-sources') + 1]).toBe('project');
    expect(c[c.indexOf('--append-system-prompt') + 1]).toBe('SKILL');
    expect(c[c.indexOf('--mcp-config') + 1]).toContain('/t/.petal');
    const k = codexArgs('hi', { path: '/bin', state: '/t/.petal' });
    expect(k.join(' ')).toContain('mcp_servers.petal.command="pnpm"');
    expect(k.join(' ')).toContain('PETAL_STATE_DIR="/t/.petal"');
    expect(k).not.toContain('resume');
    expect(codexArgs('yes', { path: '/bin', state: '/t', session: 'abc' }).slice(0, 3)).toEqual([
      'exec',
      'resume',
      'abc',
    ]);
  });

  test('--bare is someone with nothing installed: no Petal tools, no skill, only the web', () => {
    const c = claudeArgs('prompt', {
      model: 'haiku',
      skill: 'SKILL',
      session: 's',
      first: true,
      state: '/t',
      bare: true,
    });
    expect(c).not.toContain('--mcp-config');
    expect(c).not.toContain('SKILL');
    expect(c.slice(c.indexOf('--allowedTools') + 1)).toEqual(['WebFetch', 'Bash(curl *)']);
    const k = codexArgs('prompt', { path: '/bin', state: '/t', bare: true }).join(' ');
    expect(k).not.toContain('mcp_servers');
    expect(k).toContain('sandbox_workspace_write.network_access=true');
  });

  test('reads a Claude Code run', () => {
    const t = readClaude(
      [
        'not json',
        line({ type: 'system', subtype: 'init', session_id: 's1', apiKeySource: 'none' }),
        line({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'looking' },
              { type: 'tool_use', name: 'mcp__petal__find_target' },
            ],
          },
        }),
        line({ type: 'result', result: 'Shall I draw it?', is_error: false }),
      ].join('\n'),
    );
    expect(t).toEqual({
      session: 's1',
      billing: 'subscription',
      tools: ['find_target'],
      text: 'Shall I draw it?',
    });
  });

  test('says so when a run bills an API key', () => {
    const t = readClaude(
      line({ type: 'system', subtype: 'init', apiKeySource: 'ANTHROPIC_API_KEY' }),
    );
    expect(t.billing).toBe('api key: ANTHROPIC_API_KEY');
  });

  test('reads a Codex run', () => {
    const t = readCodex(
      [
        line({ type: 'thread.started', thread_id: 't1' }),
        line({ type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'find_target' } }),
        line({ type: 'item.completed', item: { type: 'command_execution', command: 'ls' } }),
        line({ type: 'item.completed', item: { type: 'agent_message', text: 'Shall I?' } }),
      ].join('\n'),
    );
    expect(t.session).toBe('t1');
    expect(t.tools).toEqual(['find_target', 'shell']);
    expect(t.text).toBe('Shall I?');
    expect(readCodex(line({ type: 'turn.failed', error: { message: 'no' } })).error).toBe('no');
  });

  test('finds the last flower and what changed from the default', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    expect(specOf(`"spec_sha256":"${a}" then spec_sha256\\":\\"${b}`)).toBe(b);
    expect(specOf('nothing')).toBeUndefined();
    expect(changesOf('{"changed_from_default":[]}')).toBe('nothing');
    expect(changesOf('{\\"changed_from_default\\":[\\"petals=10\\"]}')).toBe('petals=10');
    expect(changesOf('nothing here')).toBeUndefined();
  });
});
