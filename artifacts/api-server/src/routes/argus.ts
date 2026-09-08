import { Router } from "express";
import { getAuth } from "@clerk/express";
import { rateLimit } from "express-rate-limit";
import { callArgus } from "../lib/argusGateway";
import { publicRouteAllowed } from "../lib/gatewayProof";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";
import storageRouter from "./argusStorage";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ detail: "Sign in to access your investigation workspace." });
    return;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    let matchesOrigin = false;
    try { matchesOrigin = !!origin && new URL(origin).host === getClerkProxyHost(req); } catch { /* reject malformed origin */ }
    if (!matchesOrigin) {
      res.status(403).json({ detail: "Cross-origin modifications are not allowed." });
      return;
    }
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(rateLimit({
  windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (req) => getAuth(req).userId || "unauthenticated",
}));
router.use("/storage", storageRouter);
router.use(async (req, res) => {
  // These methods are only callable by the verified upload broker, not clients.
  // Public API route segments contain only fixed names and UUIDs, never escapes.
  // Reject path ambiguity before FastAPI or the proxy can decode it differently.
  if (!publicRouteAllowed(req.path)) {
    res.status(404).json({ detail: "Not found." });
    return;
  }
  const upstream = await callArgus(req, req.originalUrl, req.method,
    ["GET", "HEAD"].includes(req.method) ? undefined : req.body);
  for (const name of ["content-type", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
});
export default router;