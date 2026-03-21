import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./data/bills";
}

/**
 * Save a PDF buffer to disk.
 * Returns a storage ref (relative path) suitable for storing in the DB.
 */
export async function saveFile(
  householdId: string,
  billId: string,
  buffer: Buffer
): Promise<string> {
  const rel = `${householdId}/${billId}.pdf`;
  const abs = join(uploadDir(), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return rel;
}

export async function getFile(storageRef: string): Promise<Buffer> {
  return readFile(join(uploadDir(), storageRef));
}

export async function deleteFile(storageRef: string): Promise<void> {
  await unlink(join(uploadDir(), storageRef)).catch(() => {});
}

export function fileExists(storageRef: string): boolean {
  return existsSync(join(uploadDir(), storageRef));
}
