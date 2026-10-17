/**
 * The words of Kenali Profil Risikomu (REN-06, REN-07): the three profiles and the table that turns
 * the five answers into one. The quiz's four options per question are sent as 0–3 in the order the
 * boards KuisRisiko…KuisRisiko5 list them; this table, not AI, decides the profile (lane REN-06).
 * Only the profile leaves the server, never the points. The profiles and the question and option
 * counts live in lib/constants/plan.ts.
 */

import { RISK_PROFILE } from './plan.ts';

/**
 * Points per option (index = the board's order), from the most cautious answer (1) to the most
 * risk-tolerant (4); "Belum Tahu" always scores 1 (coordinator's decision: the boards give no
 * weights).
 * 1 Tujuan: Menjaga Nilai dari Inflasi 2 · Menambah Dana Pelan-pelan 3 · Mengejar Pertumbuhan
 *   Tinggi 4 · Belum Tahu 1.
 * 2 Turun 15%: Jual Semua 2 · Diam dan Tunggu Pulih 3 · Tambah Sedikit 4 · Belum Tahu 1.
 * 3 Lama dibiarkan: kurang dari 1 tahun 1 · 1–3 tahun 2 · 3–5 tahun 3 · lebih dari 5 tahun 4.
 * 4 Pengalaman: Belum Pernah 1 · Menabung atau Deposito 2 · Reksa Dana 3 · Saham atau Kripto 4.
 * 5 Setoran bulanan: sampai 5% gaji 1 · 5–10% 2 · 10–20% 3 · lebih dari 20% 4.
 * The boards' own answers (3 + 3 + 2 + 1 + 2 = 11) give Moderat, as HasilRisiko shows.
 */
export const RISK_ANSWER_POINTS: readonly (readonly number[])[] = [
  [2, 3, 4, 1],
  [2, 3, 4, 1],
  [1, 2, 3, 4],
  [1, 2, 3, 4],
  [1, 2, 3, 4],
];

/** Totals 5–20: Konservatif up to 10, Moderat 11–15, Agresif from 16. */
export const CONSERVATIVE_UP_TO = 10;
export const AGGRESSIVE_FROM = 16;

/**
 * Question 3 (how long the money can stay untouched) caps the profile: under a year at most
 * Konservatif, 1–3 years at most Moderat.
 */
export const RISK_HORIZON_QUESTION = 2;
export const RISK_HORIZON_CAPS: Readonly<
  Record<number, (typeof RISK_PROFILE)[keyof typeof RISK_PROFILE]>
> = {
  0: RISK_PROFILE.conservative,
  1: RISK_PROFILE.moderate,
};
