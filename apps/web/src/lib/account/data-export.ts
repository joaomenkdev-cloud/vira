import type { DataExport } from "@vira/shared";

/** The name the downloaded file gets: the day of the export, like the API's own header. */
export function exportFileName(exportedAt: string): string {
  return `vira-meus-dados-${exportedAt.slice(0, 10)}.json`;
}

/** The file as people open it: indented, so it reads in any text editor. */
export function exportFileContent(data: DataExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Hands the export to the browser as a download, without leaving the page. */
export function saveExport(data: DataExport): void {
  const url = URL.createObjectURL(
    new Blob([exportFileContent(data)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(data.exportedAt);
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has been handled: revoking at once can cancel the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
