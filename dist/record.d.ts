import type { TourResult } from './types.js';
/** A recording that failed for a known reason: the first line says what happened, the second what to do. */
export declare class RecordingError extends Error {
}
/** What to do about a browser that did not start; shared with doctor. */
export declare function browserFix(error: unknown, channel: string): string;
/** A tour's recording in .videos/: `login` is .videos/login.mp4, `apps/web/login` is .videos/apps/web/login.mp4. */
export declare const recordingFile: (outDir: string, name: string) => string;
export declare function removeRecording(outDir: string, name: string, { keepVideo }?: {
    keepVideo?: boolean | undefined;
}): Promise<void>;
/** The result a recording carries, or null if the file is not a pro-tour recording. */
export declare function readRecording(video: string): Promise<TourResult | null>;
export interface RecordOptions {
    repo: string;
    url: string;
    outDir: string;
    name: string;
    /** 'chromium' (Playwright's own build, the default) or an installed browser such as 'chrome'. */
    channel?: string;
    commit: string | null;
    dirty: boolean;
    /** The git tree of the code being recorded, uncommitted changes included (see workingTree). */
    tree?: string | null;
    /** Run the tour without recording it, and without pauses, for fixing a tour quickly. */
    fast?: boolean;
    /** CSS selectors of elements to hide in the video, such as a dev server's toolbar. */
    hide?: string[];
    /** Aborting it stops the recording, leaving the previous one as it was. */
    signal?: AbortSignal;
}
export interface Recording {
    result: TourResult;
    /** The MP4, or null when the tour failed before anything was recorded. */
    video: string | null;
    /** The full error of a failed tour, and the page's visible DOM where it stopped. */
    error?: string;
    dom?: string;
    /** Where in the tour it failed, such as .tours/login.tour.ts:12:5. */
    at?: string;
}
/** Record the tour, replacing its previous recording in outDir. A fast run records nothing and replaces nothing. */
export declare function recordTour(file: string, { repo, url, outDir, name, channel, commit, dirty, tree, fast, hide, signal }: RecordOptions): Promise<Recording>;
