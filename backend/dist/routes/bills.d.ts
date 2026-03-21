import { Hono } from "hono";
type Vars = {
    Variables: {
        userId: string;
    };
};
declare const router: Hono<Vars, import("hono/types").BlankSchema, "/">;
export default router;
//# sourceMappingURL=bills.d.ts.map