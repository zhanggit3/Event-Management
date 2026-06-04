/**
 * Canonical storage-key builder for the `library-files` bucket.
 *
 * Pure + isomorphic: the client builds the key locally before a direct-to-Storage
 * upload (no Server Action round-trip), and the server reuses the same format for
 * cross-bucket copies. The first path segment is the org id — it must match the
 * storage RLS check (`split_part(name,'/',1)::uuid`).
 */
export function libraryStorageKey(orgId: string, folderId: string | null, fileName: string): string {
  return `${orgId}/${folderId ?? "root"}/${Date.now()}_${fileName}`;
}
