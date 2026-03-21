import { Hono } from "hono";
declare const auth: Hono<{
    Variables: {
        userId: string;
        userEmail: string;
    };
}, import("hono/types").BlankSchema, "/">;
export default auth;
//# sourceMappingURL=auth.d.ts.map