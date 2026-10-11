// Types for writing tours:
//
//   import type { Tour, TourMeta } from 'pro-tour';
//   export const meta = { title: '…', behaviors: { … } } satisfies TourMeta;
//   export async function run(t: Tour): Promise<void> { … }
export type { Tour } from './runtime.ts';
export type { Check, StepOptions, TourMeta, TourModule } from './types.ts';
