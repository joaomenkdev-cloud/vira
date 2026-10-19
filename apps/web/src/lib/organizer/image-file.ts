import {
  EVENT_IMAGE_CONTENT_TYPES,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_MIN_HEIGHT,
  EVENT_IMAGE_MIN_WIDTH,
} from "@vira/shared";

/*
 * The checks a picture passes in the browser before it is sent: the format and size the
 * upload URL is signed for, and the smallest size that fills the banner. The API checks
 * the real bytes again after the upload (N9); these only spare a useless upload.
 */

const TYPES: ReadonlySet<string> = new Set(EVENT_IMAGE_CONTENT_TYPES);

/** The problem with the file's format or weight, before reading it. */
export function fileProblem(file: Pick<File, "type" | "size">): string | undefined {
  if (!TYPES.has(file.type)) return "Escolha uma imagem JPEG, PNG ou WebP.";
  if (file.size > EVENT_IMAGE_MAX_BYTES) return "A imagem pode ter até 5 MB.";
  if (file.size === 0) return "O arquivo está vazio.";
  return undefined;
}

/** The problem with the picture's size in pixels, once the browser has decoded it. */
export function dimensionsProblem(width: number, height: number): string | undefined {
  return width < EVENT_IMAGE_MIN_WIDTH || height < EVENT_IMAGE_MIN_HEIGHT
    ? `A imagem precisa ter ao menos ${String(EVENT_IMAGE_MIN_WIDTH)} × ${String(EVENT_IMAGE_MIN_HEIGHT)} pixels; esta tem ${String(width)} × ${String(height)}.`
    : undefined;
}

/** Everything wrong with the file, or `undefined` when it can be sent. */
export async function checkImageFile(file: File): Promise<string | undefined> {
  const problem = fileProblem(file);
  if (problem) return problem;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    return dimensionsProblem(width, height);
  } catch {
    return "Não foi possível ler a imagem; o arquivo pode estar corrompido.";
  }
}
