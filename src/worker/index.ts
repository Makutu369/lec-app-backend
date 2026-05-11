import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth";
import coursesRoutes from "../routes/courses";
import sectionsRoutes from "../routes/sections";
import megaCentersRoutes from "../routes/mega-centers";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
};

const app = new Hono<Env>();

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get("/api/", (c) =>
  c.json({
    name: "LEC App Backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.route("/api/auth", authRoutes);
app.route("/api/courses", coursesRoutes);
app.route("/api/sections", sectionsRoutes);
app.route("/api/mega-centers", megaCentersRoutes);

export default app;
