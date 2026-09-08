import type { RequestHandler } from "express";
import { checkArgusReadiness } from "../lib/argusGateway";

export const readinessHandler: RequestHandler = async (_req, res) => {
  // Expose only aggregate availability, never private dependency details.
  if (await checkArgusReadiness()) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "unavailable" });
  }
};