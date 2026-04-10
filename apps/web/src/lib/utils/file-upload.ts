import * as XLSX from "xlsx";

// --- Types ---

export interface FileAttachment {
  type: "image" | "pdf" | "text" | "excel";
  filename: string;
  mimeType: string;
  /** base64 data (for image/pdf) */
  base64?: string;
  /** data URL for preview (for images) */
  preview?: string;
  /** extracted text content (for text/excel files) */
  textContent?: string;
}

// --- Supported extensions ---

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const PDF_TYPES = ["application/pdf"];
const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const TEXT_EXTENSIONS = [".txt", ".csv", ".md", ".json", ".xml", ".html", ".css", ".js", ".ts", ".py", ".yaml", ".yml", ".log", ".sql"];

export const ACCEPTED_FILE_TYPES = "image/*,.pdf,.xlsx,.xls,.txt,.csv,.md,.json,.xml,.html,.css,.js,.ts,.py,.yaml,.yml,.log,.sql";

// --- File classification ---

function getFileType(file: File): FileAttachment["type"] {
  if (IMAGE_TYPES.includes(file.type) || file.type.startsWith("image/")) return "image";
  if (PDF_TYPES.includes(file.type)) return "pdf";
  if (EXCEL_TYPES.includes(file.type)) return "excel";
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  // Fallback: try as text
  return "text";
}

// --- Readers ---

function readAsBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: dataUrl.split(",")[1], dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseExcel(buffer: ArrayBuffer, filename: string): string {
  const workbook = XLSX.read(buffer, { type: "array" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Convert to array of arrays
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length === 0) continue;

    parts.push(`## Sheet: ${sheetName}\n`);

    // Build markdown table
    const header = rows[0].map((cell) => String(cell));
    const separator = header.map(() => "---");
    parts.push("| " + header.join(" | ") + " |");
    parts.push("| " + separator.join(" | ") + " |");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].map((cell) => String(cell));
      parts.push("| " + row.join(" | ") + " |");
    }
    parts.push("");
  }

  return `File: ${filename}\n\n${parts.join("\n")}`;
}

// --- Main processing function ---

export async function processFile(file: File): Promise<FileAttachment> {
  const fileType = getFileType(file);

  switch (fileType) {
    case "image": {
      const { base64, dataUrl } = await readAsBase64(file);
      return {
        type: "image",
        filename: file.name,
        mimeType: file.type,
        base64,
        preview: dataUrl,
      };
    }
    case "pdf": {
      const { base64 } = await readAsBase64(file);
      return {
        type: "pdf",
        filename: file.name,
        mimeType: file.type,
        base64,
      };
    }
    case "excel": {
      const buffer = await readAsArrayBuffer(file);
      const textContent = parseExcel(buffer, file.name);
      return {
        type: "excel",
        filename: file.name,
        mimeType: file.type,
        textContent,
      };
    }
    case "text": {
      const text = await readAsText(file);
      return {
        type: "text",
        filename: file.name,
        mimeType: file.type || "text/plain",
        textContent: `File: ${file.name}\n\n${text}`,
      };
    }
  }
}

// --- Build API content blocks ---

export function buildContentBlocks(
  text: string,
  attachments?: FileAttachment[]
): string | object[] {
  if (!attachments || attachments.length === 0) return text;

  const blocks: object[] = [];

  for (const att of attachments) {
    if (att.type === "image" && att.base64) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.base64 },
      });
    } else if (att.type === "pdf" && att.base64) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: att.base64 },
      });
    } else if (att.textContent) {
      // Excel and text files — send as text block
      blocks.push({ type: "text", text: att.textContent });
    }
  }

  if (text) blocks.push({ type: "text", text });

  return blocks.length === 1 && (blocks[0] as any).type === "text" && !(blocks[0] as any).source
    ? text
    : blocks;
}
