export interface InitResult {
    /** What was written or removed. */
    changes: string[];
    /** What was left alone on purpose, and why. */
    notes: string[];
}
export declare function init(repo: string, cwd?: string): Promise<InitResult>;
