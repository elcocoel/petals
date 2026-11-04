import { notImplemented } from '@petal/core';
import type { GroupingRules, Snapshot } from '@petal/core/types';

export const NEAR_VALIDATORS_RULES: GroupingRules = {
  relationship: 'delegates_to',
  min_amount: '1000',
  unit: 'NEAR',
  group_by: ['to', 'backer_class'],
};

export async function importSpike(path: string, rules: GroupingRules): Promise<Snapshot> {
  return notImplemented(`importSpike(${path}, ${rules.min_amount})`);
}
