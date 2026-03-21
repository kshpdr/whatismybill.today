import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
function uploadDir() {
    return process.env.UPLOAD_DIR ?? "./data/bills";
}
/**
 * Save a PDF buffer to disk.
 * Returns a storage ref (relative path) suitable for storing in the DB.
 */
export async function saveFile(householdId, billId, buffer) {
    const rel = `${householdId}/${billId}.pdf`;
    const abs = join(uploadDir(), rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return rel;
}
export async function getFile(storageRef) {
    return readFile(join(uploadDir(), storageRef));
}
export async function deleteFile(storageRef) {
    await unlink(join(uploadDir(), storageRef)).catch(() => { });
}
export function fileExists(storageRef) {
    return existsSync(join(uploadDir(), storageRef));
}
//# sourceMappingURL=storage.js.map