// Types shared by tours, the runtime and the publisher. Tours import them with
// `import type { Tour, TourMeta } from 'pro-tour'`.
import type { Tour } from './runtime.ts';

export interface TourMeta {
  /** Shown on the title card and as the comment heading. */
  title: string;
  /** One sentence for the title card. */
  summary?: string;
  /** What the change lets a user see or do, by id; every id must be covered by a passing step. */
  behaviors?: Record<string, string>;
}

/** A tour module: `export const meta` and `export async function run(t)`. */
export interface TourModule {
  meta: TourMeta;
  run(t: Tour): Promise<void>;
}

export type CheckKind = 'visible' | 'hidden' | 'text' | 'value' | 'custom';

/** Built with t.visible, t.hidden, t.text, t.value or t.check; the step decides when to evaluate it. */
export interface Check {
  kind: CheckKind;
  label: string;
  test: () => boolean | Promise<boolean>;
}

export interface StepOptions {
  /** Ids from meta.behaviors that this step demonstrates. */
  covers?: string[];
}

export interface CheckResult {
  label: string;
  kind: CheckKind;
  passed: boolean;
  /** False when the check was already true before the step's actions. */
  changed: boolean;
  detail?: string;
}

export interface StepResult {
  index: number;
  title: string;
  status: 'running' | 'passed' | 'failed';
  covers: string[];
  checks: CheckResult[];
  error?: string;
  seconds?: number;
}

export interface Coverage {
  id: string;
  description: string;
  /** Indexes of the passing steps that cover this behavior. */
  steps: number[];
}

export interface Report {
  title: string;
  summary?: string;
  url: string;
  tourSha: string | null;
  status: 'passed' | 'failed';
  steps: StepResult[];
  coverage?: Coverage[];
  error?: string;
  seconds?: number;
  video?: string;
  /** sha256 of the video, so publish can tell the report and the video belong together. */
  videoSha?: string;
  failureFile?: string;
}
