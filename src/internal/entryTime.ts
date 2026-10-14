/**
 * The modification time stamped on every entry an archive write produces.
 * Writers never use the current time, so the same entries written twice, on
 * any machine, produce byte-identical archives with the same content hash.
 *
 * 1980-01-01 is the earliest time a zip entry can hold. Zip stores it as
 * local date and time fields, so `ZIP_ENTRY_MTIME` is built from local
 * components: it reads back as 1980-01-01 00:00 in every time zone, which
 * keeps the bytes the same everywhere. Tar and 7z store an absolute instant,
 * so they use the same moment in UTC.
 */
export const ZIP_ENTRY_MTIME = new Date(1980, 0, 1);
export const ENTRY_MTIME = new Date(Date.UTC(1980, 0, 1));
