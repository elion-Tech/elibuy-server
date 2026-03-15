import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    name: string;
  };
}

export const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, JWT_SECRET!, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    (req as any).user = user;
    next();
  });
};

export const authenticateToken = auth;
