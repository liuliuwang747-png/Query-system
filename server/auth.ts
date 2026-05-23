import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const secret = process.env.SESSION_SECRET || "cath-lab-dev-secret-change-me";
const maxAgeMs = 1000 * 60 * 60 * 12;

function sign(payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createToken(username: string) {
  const body = Buffer.from(JSON.stringify({ username, exp: Date.now() + maxAgeMs })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { username: string; exp: number };
  if (Date.now() > payload.exp) return null;
  return payload.username;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const username = token ? verifyToken(token) : null;
  if (!username) {
    res.status(401).json({ error: "未登录或登录已过期" });
    return;
  }
  req.adminUser = username;
  next();
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: string;
    }
  }
}
