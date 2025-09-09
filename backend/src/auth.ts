import jwt from "jsonwebtoken";
import type { Response, NextFunction } from "express";
import { env } from "./env";
import type { AuthedRequest, JwtUser } from "./types";

export function signJwt(payload: JwtUser): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtUser & { iat: number; exp: number };
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}



