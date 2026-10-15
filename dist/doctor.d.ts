export interface DoctorCheck {
    name: string;
    ok: boolean;
    fix?: string;
}
export declare function doctor({ channel }?: {
    channel?: string;
}): Promise<DoctorCheck[]>;
