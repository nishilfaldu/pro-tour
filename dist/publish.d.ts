type Env = NodeJS.ProcessEnv;
export interface PullRequest {
    number: number;
    url: string;
    /** owner/name */
    repo: string;
    /** The base branch name. */
    base: string;
    /** The commit at the head of the PR. */
    head: string;
}
export declare function resolvePr(repo: string, { target, branch, env }: {
    target?: string;
    branch?: string;
    env: Env;
}): Promise<PullRequest>;
export type PublishResult = {
    name: string;
    body: string;
} | {
    name: string;
    url: string;
    reused: boolean;
};
/**
 * Post each named recording to the PR. A dry run returns the comment bodies instead. Each video is deleted
 * once its comment is up, and .videos/ with it when it is empty. A recording that does not show the PR head's
 * code is refused unless allowStale is set.
 */
export declare function publishTours(repo: string, pr: PullRequest, names: string[], { env, dryRun, allowStale }?: {
    env?: Env;
    dryRun?: boolean;
    allowStale?: boolean;
}): Promise<PublishResult[]>;
export {};
