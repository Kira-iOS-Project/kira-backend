/**
 * OJK's "Perusahaan Fintech Lending Berizin per Juli 2026" (94 companies), copied from the PDF
 * attached to the directory page below into legality.lenders.json. Static data: refresh the JSON,
 * with LENDERS_AS_OF and the source, when OJK publishes a newer directory.
 */

import lenders from './legality.lenders.json' with { type: 'json' };

export type LicensedLender = {
  company: string;
  /** Nama Sistem Elektronik: the app or platform name people know. */
  app: string;
  /** Surat Tanda Berizin/Terdaftar. */
  license: string;
  licensedOn: string;
  type: 'conventional' | 'sharia';
  website: string;
};

/** The last day the directory covers ("Sampai dengan 31 Juli 2026"). */
export const LENDERS_AS_OF = '2026-07-31';

export const LENDERS_SOURCE =
  'https://ojk.go.id/id/kanal/iknb/data-dan-statistik/direktori/fintech/Pages/Direktori-Layanan-Pendanaan-Bersama-Berbasis-Teknologi-Informasi-Juli-2026.aspx';

/** The JSON keeps one entry per company; `type` is narrowed here, so a typo reads as conventional. */
export const LICENSED_LENDERS: readonly LicensedLender[] = lenders.map(
  ({ company, app, license, licensedOn, type, website }) => ({
    company,
    app,
    license,
    licensedOn,
    type: type === 'sharia' ? 'sharia' : 'conventional',
    website,
  }),
);
