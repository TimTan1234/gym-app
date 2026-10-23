import "server-only";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { ProcurementSource } from "@/lib/ai/schemas";

// Turns uploaded files and pasted text into what the AI reads: plain text plus
// image data URLs. Files are checked by extension and by their first bytes, and
// nothing is stored.

export const MAX_FILES = 4;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 20_000;

/** Message keys under `procurement.errors`. */
export type ExtractErrorKey = "tooManyFiles" | "fileTooLarge" | "fileType" | "scannedPdf" | "unreadable" | "emptyInput";

export class ExtractError extends Error {
  constructor(readonly key: ExtractErrorKey) {
    super(key);
  }
}

type Kind = "IMAGE" | "MARKDOWN" | "TEXT" | "DOCX" | "PDF";

const EXTENSIONS: Record<string, Kind> = {
  jpg: "IMAGE",
  jpeg: "IMAGE",
  png: "IMAGE",
  webp: "IMAGE",
  md: "MARKDOWN",
  markdown: "MARKDOWN",
  txt: "TEXT",
  docx: "DOCX",
  pdf: "PDF",
};

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The image MIME type from the file's first bytes, or null if it isn't JPEG, PNG or WebP. */
function imageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

export function fileKind(name: string): Kind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXTENSIONS[ext] ?? null;
}

export interface ExtractedSource {
  text: string;
  images: string[];
  source: ProcurementSource;
}

export async function extractSource(files: File[], pasted?: string): Promise<ExtractedSource> {
  if (files.length > MAX_FILES) throw new ExtractError("tooManyFiles");
  const parts: string[] = [];
  const images: string[] = [];
  const kinds = new Set<Kind>();

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new ExtractError("fileTooLarge");
    const kind = fileKind(file.name);
    if (!kind) throw new ExtractError("fileType");
    const bytes = new Uint8Array(await file.arrayBuffer());
    kinds.add(kind);

    if (kind === "IMAGE") {
      const type = imageType(bytes);
      if (!type) throw new ExtractError("fileType");
      images.push(`data:${type};base64,${Buffer.from(bytes).toString("base64")}`);
      continue;
    }
    const text = await readText(kind, bytes);
    if (text.trim()) parts.push(`--- ${file.name} ---\n${text.trim()}`);
  }

  const typed = pasted?.trim();
  if (typed) {
    kinds.add("TEXT");
    parts.push(`--- Pasted text ---\n${typed}`);
  }

  const text = parts.join("\n\n").slice(0, MAX_TEXT_CHARS);
  if (!text && images.length === 0) throw new ExtractError("emptyInput");
  return { text, images, source: sourceOf(kinds) };
}

async function readText(kind: Exclude<Kind, "IMAGE">, bytes: Uint8Array): Promise<string> {
  if (kind === "DOCX") {
    if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new ExtractError("fileType");
    try {
      return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw new ExtractError("unreadable");
    }
  }
  if (kind === "PDF") {
    if (!startsWith(bytes, ascii("%PDF-"))) throw new ExtractError("fileType");
    let text: string;
    try {
      text = (await extractText(bytes, { mergePages: true })).text;
    } catch {
      throw new ExtractError("unreadable");
    }
    // A scanned PDF is pictures of pages with no text layer.
    if (text.replace(/\s/g, "").length < 10) throw new ExtractError("scannedPdf");
    return text;
  }
  // Markdown or plain text: reject binary files renamed to .md/.txt.
  if (bytes.includes(0)) throw new ExtractError("fileType");
  return new TextDecoder("utf-8").decode(bytes);
}

function sourceOf(kinds: Set<Kind>): ProcurementSource {
  if (kinds.size !== 1) return "MIXED";
  return [...kinds][0];
}
