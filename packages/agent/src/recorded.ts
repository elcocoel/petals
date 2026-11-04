import { notImplemented } from '@petal/core';
import type { LlmClient } from './llm.ts';

export function recordedClient(transcriptFile: string): LlmClient {
  return notImplemented(`recordedClient(${transcriptFile})`);
}
