import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth";
import coursesRoutes from "../routes/courses";
import sectionsRoutes from "../routes/sections";
import megaCentersRoutes from "../routes/mega-centers";
import examsRoutes from "../routes/exams";
import certificatesRoutes from "../routes/certificates";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
};

const app = new Hono<Env>();

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/api/", (c) =>
  c.json({
    name: "LEC App Backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/courses", coursesRoutes);
app.route("/api/sections", sectionsRoutes);
app.route("/api/mega-centers", megaCentersRoutes);
app.route("/api/exams", examsRoutes);
app.route("/api/certificates", certificatesRoutes);

export default app;
