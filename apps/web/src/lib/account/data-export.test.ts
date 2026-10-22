import { DATA_EXPORT_FORMAT, type DataExport } from "@vira/shared";
import { describe, expect, it } from "vitest";

import { exportFileContent, exportFileName } from "./data-export";

describe("the data export file", () => {
  it("is named after the day it was made", () => {
    expect(exportFileName("2026-12-01T23:59:00.000Z")).toBe("vira-meus-dados-2026-12-01.json");
  });

  it("keeps every field, indented", () => {
    const data = {
      format: DATA_EXPORT_FORMAT,
      exportedAt: "2026-12-01T12:00:00.000Z",
      account: { name: "Ana" },
    } as unknown as DataExport;
    const content = exportFileContent(data);
    expect(JSON.parse(content)).toEqual(data);
    expect(content).toContain('\n  "format": "vira.data-export.v1",');
  });
});
