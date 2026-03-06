import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import compression from "compression";
import { connectDB } from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";

dotenv.config();

async function startServer() {
  await connectDB();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Security and Performance
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"], // Adjust as needed
      },
    },
  }));
  app.use(compression());

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173" // For local frontend dev
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
  }));
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    const status = {
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      readyState: mongoose.connection.readyState
    };
    res.json(status);
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/stats", statsRoutes);

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[Error] ${req.method} ${req.url}:`, err.stack || err.message);
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
