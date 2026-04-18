import type { CompanionMeta } from '@vsc-neuropilot/api-types';

export type CompanionMetaWithName = Omit<CompanionMeta, 'name'> & { name: string };
