import { createMiddleware } from "hono/factory";
import type { JwtPayload } from "../lib/jwt";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: JwtPayload;
  };
};

export const adminGuard = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");
  console.log(user);

  if (!user || user.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
});
