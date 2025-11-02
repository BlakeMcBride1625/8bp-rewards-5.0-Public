import { Pool } from 'pg';
export declare function getPool(): Pool;
export interface RegistrationData {
    id?: string;
    eightBallPoolId: string;
    username: string;
    email?: string;
    discordId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    isActive?: boolean;
    metadata?: any;
}
export declare class Registration {
    id?: string;
    eightBallPoolId: string;
    username: string;
    email?: string;
    discordId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    isActive?: boolean;
    metadata?: any;
    constructor(data: RegistrationData);
    static find(query?: any): Promise<Registration[]>;
    static findOne(query: any): Promise<Registration | null>;
    static findById(id: string): Promise<Registration | null>;
    save(): Promise<Registration>;
    delete(): Promise<void>;
    toObject(): any;
}
export interface ClaimRecordData {
    id?: string;
    eightBallPoolId: string;
    websiteUserId?: string;
    status: 'success' | 'failed';
    itemsClaimed?: string[];
    error?: string;
    claimedAt?: Date;
    metadata?: any;
}
export declare class ClaimRecord {
    id?: string;
    eightBallPoolId: string;
    websiteUserId?: string;
    status: 'success' | 'failed';
    itemsClaimed?: string[];
    error?: string;
    claimedAt?: Date;
    metadata?: any;
    constructor(data: ClaimRecordData);
    static find(query?: any): Promise<ClaimRecord[]>;
    static findOne(query: any): Promise<ClaimRecord | null>;
    save(): Promise<ClaimRecord>;
    delete(): Promise<void>;
    toObject(): any;
    static getClaimStats(days?: number): Promise<any[]>;
    static getUserClaimTotals(eightBallPoolId: string, days?: number): Promise<any[]>;
}
declare const _default: {
    Registration: typeof Registration;
    ClaimRecord: typeof ClaimRecord;
};
export default _default;
//# sourceMappingURL=Registration.d.ts.map