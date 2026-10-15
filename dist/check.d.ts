export interface TypeCheck {
    ok: boolean;
    /** Compiler errors, with paths relative to cwd. */
    output: string;
    checked: string[];
}
export declare function checkTours(files: string[], cwd?: string): Promise<TypeCheck>;
