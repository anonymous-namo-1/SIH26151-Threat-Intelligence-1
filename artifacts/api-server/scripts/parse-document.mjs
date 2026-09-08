// Isolated parser: no persistent local files, bounded heap, killed by its parent.
process.once("message", async ({ data, extension }) => {
  try {
    const bytes = Buffer.from(data, "base64");
    let text = "";
    if (extension === "pdf") {
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF signature.");
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: bytes });
      try {
        const info = await parser.getInfo();
        if (info.total > 100) throw new Error("PDF documents are limited to 100 pages.");
        text = (await parser.getText()).text;
      } finally { await parser.destroy(); }
    } else if (extension === "docx") {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Invalid DOCX signature.");
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else if (["txt", "md", "csv", "json"].includes(extension)) {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) throw new Error("Binary data is not accepted as text.");
      if (extension === "json") JSON.parse(text);
    } else throw new Error("Unsupported document format.");
    if (!text.trim()) throw new Error("No extractable text. Scanned documents require OCR before import.");
    if (text.length > 200_000) throw new Error("Extracted text exceeds 200,000 characters. Split the document before importing.");
    process.send({ text });
  } catch (error) {
    process.send({ error: error instanceof SyntaxError ? "Invalid JSON document." : error.message || "Document parsing failed." });
  }
});