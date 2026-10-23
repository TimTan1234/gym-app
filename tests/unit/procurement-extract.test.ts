import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ExtractError, MAX_FILE_BYTES, MAX_TEXT_CHARS, extractSource } from "@/lib/procurement/extract";

const fixture = (name: string, type = "") => new File([readFileSync(new URL(`../fixtures/${name}`, import.meta.url))], name, { type });

async function errorKey(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ExtractError) return e.key;
    throw e;
  }
  return null;
}

describe("extractSource", () => {
  it("reads Markdown as text", async () => {
    const out = await extractSource([fixture("groceries.md", "text/markdown")]);
    expect(out.source).toBe("MARKDOWN");
    expect(out.text).toContain("2 kg chicken breast");
    expect(out.images).toEqual([]);
  });

  it("reads Word documents", async () => {
    const out = await extractSource([fixture("groceries.docx")]);
    expect(out.source).toBe("DOCX");
    expect(out.text).toContain("1 tray eggs");
  });

  it("reads PDFs with a text layer", async () => {
    const out = await extractSource([fixture("groceries.pdf", "application/pdf")]);
    expect(out.source).toBe("PDF");
    expect(out.text).toContain("chicken breast");
  });

  it("asks for a photo when a PDF is a scan", async () => {
    expect(await errorKey(extractSource([fixture("scanned.pdf")]))).toBe("scannedPdf");
  });

  it("turns photos into data URLs", async () => {
    const out = await extractSource([fixture("nasi-lemak.jpg", "image/jpeg")]);
    expect(out.source).toBe("IMAGE");
    expect(out.images[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(out.text).toBe("");
  });

  it("combines pasted text with files as MIXED", async () => {
    const out = await extractSource([fixture("groceries.md")], "  also bananas  ");
    expect(out.source).toBe("MIXED");
    expect(out.text).toContain("also bananas");
    expect((await extractSource([], "rice")).source).toBe("TEXT");
  });

  it("checks file contents, not just the name", async () => {
    // A JPEG renamed to .docx/.pdf, and binary data renamed to .md.
    const jpeg = readFileSync(new URL("../fixtures/nasi-lemak.jpg", import.meta.url));
    expect(await errorKey(extractSource([new File([jpeg], "list.docx")]))).toBe("fileType");
    expect(await errorKey(extractSource([new File([jpeg], "list.pdf")]))).toBe("fileType");
    expect(await errorKey(extractSource([new File([jpeg], "list.md")]))).toBe("fileType");
    expect(await errorKey(extractSource([new File(["%PDF-1.4"], "list.png")]))).toBe("fileType");
    expect(await errorKey(extractSource([new File(["x"], "list.exe")]))).toBe("fileType");
  });

  it("enforces the limits", async () => {
    const md = () => fixture("groceries.md");
    expect(await errorKey(extractSource([md(), md(), md(), md(), md()]))).toBe("tooManyFiles");
    expect(await errorKey(extractSource([new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.txt")]))).toBe("fileTooLarge");
    expect(await errorKey(extractSource([], "   "))).toBe("emptyInput");
    expect((await extractSource([], "a".repeat(MAX_TEXT_CHARS + 500))).text.length).toBe(MAX_TEXT_CHARS);
  });
});
