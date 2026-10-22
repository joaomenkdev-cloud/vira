import QRCode from "qrcode";

/** A QR Code as one SVG path: `size` modules per side, each dark module a 1×1 square. */
export interface QrPath {
  size: number;
  d: string;
}

/**
 * The QR Code of a ticket token (docs/DESIGN.md, 3.10): error correction M, drawn as a
 * single path the page renders itself, so no markup string and no inline style reach
 * the DOM (the page's Content Security Policy forbids both).
 */
export function qrPath(text: string): QrPath {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column)) parts.push(`M${String(column)} ${String(row)}h1v1h-1z`);
    }
  }
  return { size: modules.size, d: parts.join("") };
}
