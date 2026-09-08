import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// One managed API service owns the public gateway and private Python/cache
// processes. Only the gateway binds publicly; no business API auth bypass.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 4000);
  force.unref();
  setTimeout(() => process.exit(code), 4500);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
function start(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
  children.push(child);
  child.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", service: command, message: err.message }));
    stop(1);
  });
  child.on("exit", (code) => { if (!stopping) stop(code || 1); });
  return child;
}
const env = { ...process.env };
if (!env.REDIS_URL) {
  start("redis-server", ["--bind", "127.0.0.1", "--port", "6380", "--save", "", "--appendonly", "no", "--protected-mode", "yes"], env);
  env.REDIS_URL = "redis://127.0.0.1:6380";
}
start("python", ["-m", "apps.api.main"], env);
const internalPort = env.ARGUS_INTERNAL_PORT || "8002";
let ready = false;
for (let attempt = 0; attempt < 80 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${internalPort}/healthz`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch { /* Wait for the private child to bind, not a data fallback. */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) {
  console.error(JSON.stringify({ level: "error", message: "ARGUS private API did not become ready. Check database setup and API logs." }));
  stop(1);
} else {
  start("node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], env);
}