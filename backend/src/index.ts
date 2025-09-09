import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env";
import { prisma } from "./db";

import authRouter from "./routes/auth";
import profileRouter from "./routes/profile";
import foodsRouter from "./routes/foods";
import mealsRouter from "./routes/meals";
import exercisesRouter from "./routes/exercises";
import weightsRouter from "./routes/weights";

const app = express();
app.use(express.json());
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        /localhost:\d+$/,
        /^(https?:\/\/)?([\w-]+\.)?vercel\.app$/,
      ];
      const configured = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",") : [];
      if (!origin) return callback(null, true);
      const isAllowed =
        allowed.some((re) => (typeof re === "string" ? origin.includes(re) : re.test(origin))) ||
        configured.some((o) => origin.includes(o.trim()));
      if (isAllowed) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/foods", foodsRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/exercises", exercisesRouter);
app.use("/api/weights", weightsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
});

const port = Number(process.env.PORT || env.PORT);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});


