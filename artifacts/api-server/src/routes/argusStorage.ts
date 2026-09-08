import { createHash, randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { callArgus, GatewayError, requireJson } from "../lib/argusGateway";

const router = Router();
const storage = new ObjectStorageService();
const MAX_BYTES = 5 * 1024 * 1024;
const allowedExtensions = new Set(["txt", "md", "csv", "json", "pdf", "docx"]);
const types: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv",
  json: "application/json", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
type Ticket = { id: string; case_id: string; object_path: string; name: string; size: number; content_type: string; state: string; evidence_id?: string | null };
type EvidenceFile = { id: string; object_path?: string | null; title?: string; content_hash?: string };

function id(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new GatewayError(400, "A valid identifier is required.");
  }
  return value;
}

async function readOriginal(objectPath: string): Promise<Buffer> {
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > MAX_BYTES) throw new GatewayError(413, "Files must be 5 MiB or smaller.");
  // Pin the exact generation; a still-valid upload URL cannot swap bytes mid-read.
  const version = file.bucket.file(file.name, { generation: metadata.generation });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of version.createReadStream()) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BYTES) throw new GatewayError(413, "Files must be 5 MiB or smaller.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseDocument(bytes: Buffer, extension: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const script = path.join(artifactDir, "scripts/parse-document.mjs");
    const child = fork(script, [], { silent: true, execArgv: ["--max-old-space-size=192"] });
    let done = false;
    const finish = (err?: Error, text?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (err) reject(err); else resolve(text || "");
    };
    const timer = setTimeout(() => finish(new GatewayError(422, "Document parsing exceeded the safety time limit.")), 15_000);
    child.on("message", (message: { text?: string; error?: string }) => {
      if (message.error) finish(new GatewayError(422, message.error));
      else finish(undefined, message.text);
    });
    child.on("error", () => finish(new GatewayError(422, "Document parser could not start.")));
    child.on("exit", () => finish(new GatewayError(422, "Document exceeded parsing limits or is unsupported.")));
    child.send({ data: bytes.toString("base64"), extension });
  });
}

router.post("/upload-url", async (req, res) => {
  const { case_id, name, size } = req.body ?? {};
  id(case_id);
  if (typeof name !== "string" || name.length > 180 || /[/\\\0]/.test(name)) {
    throw new GatewayError(400, "Provide a filename without a path.");
  }
  const extension = name.toLowerCase().split(".").pop() || "";
  if (!allowedExtensions.has(extension)) throw new GatewayError(415, "Supported formats: TXT, Markdown, CSV, JSON, PDF and DOCX.");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) throw new GatewayError(413, "Files must be between 1 byte and 5 MiB.");
  // Check case access before generating even a short-lived upload URL.
  await requireJson(await callArgus(req, `/api/argus/cases/${case_id}`));
  const uploadUrl = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
  const ticket = await requireJson<Ticket>(await callArgus(req, "/api/argus/uploads", "POST", {
    case_id, name, size, object_path: objectPath, content_type: types[extension],
  }, "broker"));
  res.json({ upload_url: uploadUrl, upload_id: ticket.id });
});

router.post("/finalize", async (req, res) => {
  const uploadId = id(req.body?.upload_id);
  const ticket = await requireJson<Ticket>(await callArgus(req, `/api/argus/uploads/${uploadId}`, "GET", undefined, "broker"));
  if (ticket.evidence_id) {
    res.json(await requireJson(await callArgus(req, `/api/argus/evidence/${ticket.evidence_id}`)));
    return;
  }
  const bytes = await readOriginal(ticket.object_path);
  if (bytes.length !== ticket.size) throw new GatewayError(422, "Uploaded file size does not match the upload request.");
  const extension = ticket.name.split(".").pop()?.toLowerCase() || "";
  const content = await parseDocument(bytes, extension);
  const sealedPath = `/objects/sealed/${randomUUID()}`;
  const [bucket, ...prefix] = storage.getPrivateObjectDir().replace(/^\//, "").split("/");
  const sealedFile = objectStorageClient.bucket(bucket).file(`${prefix.join("/")}/${sealedPath.slice("/objects/".length)}`);
  // A presigned PUT remains usable until it expires. Seal a separate immutable
  // original that is never exposed by an upload URL, and save only that path.
  await sealedFile.save(bytes, {
    resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: "application/octet-stream" },
  });
  const result = await callArgus(req, `/api/argus/uploads/${uploadId}/finalize`, "POST", {
    content,
    sealed_object_path: sealedPath,
    content_hash: createHash("sha256").update(bytes).digest("hex"),
    source: req.body?.source || "Authorized document upload",
    source_url: req.body?.source_url || null,
    collected_at: req.body?.collected_at || null,
    reliability: req.body?.reliability || "B",
    notes: req.body?.notes || "",
  }, "broker");
  const resultBody = await result.json() as { object_path?: string };
  if (!result.ok || resultBody.object_path !== sealedPath) {
    await sealedFile.delete({ ignoreNotFound: true });
  }
  res.status(result.status).json(resultBody);
});

router.get("/evidence/:id/download", async (req, res) => {
  const me = await requireJson<{ permissions: string[] }>(await callArgus(req, "/api/argus/me"));
  if (!me.permissions.includes("report:export")) throw new GatewayError(403, "Export permission is required to download original files.");
  const evidence = await requireJson<EvidenceFile>(await callArgus(req, `/api/argus/evidence/${id(req.params.id)}`));
  if (!evidence.object_path) throw new GatewayError(404, "This evidence has no original file.");
  const bytes = await readOriginal(evidence.object_path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== evidence.content_hash) throw new GatewayError(409, "Original file integrity check failed. Do not use these bytes as evidence.");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="evidence-${evidence.id}.bin"`);
  res.send(bytes);
});

export default router;