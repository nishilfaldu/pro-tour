import { expect as baseExpect } from 'playwright/test';
declare global {
    interface Window {
        __tour: Record<string, (...args: unknown[]) => unknown>;
    }
}
export declare const test: import("playwright/test").TestType<import("playwright/test").PlaywrightTestArgs & import("playwright/test").PlaywrightTestOptions & {
    _record: void;
}, import("playwright/test").PlaywrightWorkerArgs & import("playwright/test").PlaywrightWorkerOptions>;
/** An expect's message: it is shown in the video when the expect passes or fails. */
export type Message = string | {
    message: string;
};
type PollMessage = string | {
    message: string;
    timeout?: number;
    intervals?: number[];
};
export interface TourExpect {
    /** Playwright's expect, with a message that is required: it is shown in the video. */
    <T>(actual: T, message: Message): ReturnType<typeof baseExpect<T>>;
    /** A failure is recorded, and the tour fails, but the test carries on. */
    soft<T>(actual: T, message: Message): ReturnType<typeof baseExpect.soft<T>>;
    /** Polls the function until the matcher passes. */
    poll<T>(actual: () => T | Promise<T>, message: PollMessage): ReturnType<typeof baseExpect.poll<T>>;
}
export declare const expect: TourExpect;
export {};
