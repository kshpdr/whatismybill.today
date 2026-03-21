export declare function signToken(userId: string, email: string): Promise<string>;
export declare function verifyToken(token: string): Promise<{
    sub: string;
    email: string;
}>;
//# sourceMappingURL=jwt.d.ts.map