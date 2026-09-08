import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import argusRouter from "./routes/argus";
import { GatewayError } from "./lib/argusGateway";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "1mb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api/argus", argusRouter);
app.use("/api", router);
app.use((error: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof GatewayError) {
    res.status(error.status).json({ detail: error.message });
    return;
  }
  req.log.error({ err: error }, "ARGUS request failed");
  res.status(error.status && error.status >= 400 && error.status < 500 ? error.status : 503)
    .json({ detail: "The service could not complete this request. Please try again." });
});

export default app;
