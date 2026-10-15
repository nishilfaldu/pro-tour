export declare class TourError extends Error {
}
export declare const sha: (data: string | Buffer) => string;
export declare const message: (error: unknown) => string;
export declare const exists: (path: string) => Promise<boolean>;
/** Tours are `.tour.ts` (type-checked) or `.tour.js` files. */
export declare const isTourFile: (path: string) => boolean;
export declare function repoPath(repo: string, file: string): string;
/**
 * A tour's name, unique in the repository: its path without `.tours/` and the extension, so
 * `.tours/login.tour.ts` is `login` and `apps/web/.tours/login.tour.ts` is `apps/web/login`.
 * It names the tour's recording in .videos/ and its comments on the PR.
 */
export declare const tourName: (repo: string, file: string) => string;
export declare function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv, input?: string): string;
export declare function repoRoot(cwd: string): string;
export declare function currentBranch(repo: string): string;
export declare function headCommit(repo: string): string | null;
export declare const hasChanges: (repo: string) => boolean;
export declare function workingTree(repo: string): string | null;
export declare function sameCode(repo: string, from: string, to: string): boolean | null;
export declare const hasCommit: (repo: string, commit: string) => boolean;
export declare const allTours: (repo: string) => string[];
export declare function videosDir(repo: string): Promise<string>;
export declare function recordings(repo: string): Promise<string[]>;
export declare function removeVideosDirIfEmpty(repo: string): Promise<void>;
