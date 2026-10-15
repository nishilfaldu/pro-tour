// Types shared by the tour runtime, the recorder and the publisher.

export interface CheckResult {
  /** The expect's message. */
  label: string;
  passed: boolean;
}

export interface StepResult {
  title: string;
  /** Seconds into the video when the step starts. */
  at?: number;
  status: 'running' | 'passed' | 'failed';
  checks: CheckResult[];
  error?: string;
}

/** What the tour runtime reports for one run, written for the recorder. */
export interface RunResult {
  /** 'error' means the recording could not start (the app did not open), not that the tour failed. */
  status: 'passed' | 'failed' | 'error';
  title: string;
  steps: StepResult[];
  error?: string;
  /** The page's visible DOM where the tour stopped, for repairing it. */
  dom?: string;
}

/** A recording's details, embedded in its MP4 so the video is the only file a run leaves. */
export interface TourResult {
  title: string;
  status: 'passed' | 'failed';
  steps: StepResult[];
  /** First line of the error of a failed tour. */
  error?: string;
  seconds: number;
  /** HEAD when it was recorded, and whether the working tree had uncommitted changes outside .tours/. */
  commit: string | null;
  dirty: boolean;
  /**
   * The git tree of the code it was recorded with, uncommitted changes included, so publish can tell whether it
   * shows the PR's code. Absent in recordings made before it was added.
   */
  tree?: string;
}
