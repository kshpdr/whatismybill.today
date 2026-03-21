/**
 * Save a PDF buffer to disk.
 * Returns a storage ref (relative path) suitable for storing in the DB.
 */
export declare function saveFile(householdId: string, billId: string, buffer: Buffer): Promise<string>;
export declare function getFile(storageRef: string): Promise<Buffer>;
export declare function deleteFile(storageRef: string): Promise<void>;
export declare function fileExists(storageRef: string): boolean;
//# sourceMappingURL=storage.d.ts.map