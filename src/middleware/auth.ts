import { createMiddleware } from "hono/factory";
import { verifyToken, type JwtPayload } from "../lib/jwt";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: JwtPayload;
  };
};

export const authGuard = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
