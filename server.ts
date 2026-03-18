import "dotenv/config"; // Load env vars before other imports
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import compression from "compression";
import { connectDB } from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";

async function startServer() {
  await connectDB();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Security and Performance
  app.use(helmet());
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

  // Handle 404 routes (Route not found)
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[Error] ${req.method} ${req.url}:`, err.stack || err.message);
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
      error: 'Internal Server Error',
      message: isProduction ? 'An unexpected error occurred.' : err.message,
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
