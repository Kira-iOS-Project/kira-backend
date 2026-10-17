/**
 * A part of Unduh Datamu beyond the transactions: a module's own rows about the person, written by
 * the account module after the transactions as a titled block of the same CSV. The words are
 * Indonesian (people read the file); the account module escapes every cell.
 */
export type ExportSection = {
  /** The block's title line, "Komunitas · Aturan yang Disetujui". */
  title: string;
  header: string[];
  rows: string[][];
};

/**
 * What a module may put in the export it is asked for. The safety plan (Rencana Keselamatanku) is
 * only in the file saved to the device (GET /me/export), never in the emailed copy: an inbox is
 * read on other devices and by other people.
 */
export type ExportScope = { safetyPlan: boolean };
