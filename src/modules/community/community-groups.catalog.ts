/**
 * The community categories and groups the Kira team curates (Komunitas, Detail Grup), synced into
 * the database at boot by `syncCommunityCatalog`. Their words are content a person reads, copied
 * from the boards; Lunas Bareng Jakarta is DetailGrup's, the others written to match it. A change
 * here reaches the database on the next deploy; a group the reports took down stays down.
 */

import { COMMUNITY_CATEGORY, COMMUNITY_PLATFORM } from '../../lib/constants/community.ts';
import type { Category, Platform } from './community.schema.ts';

export type CatalogCategory = { key: Category; label: string; rank: number };

export type CatalogGroup = {
  id: string;
  name: string;
  category: Category;
  platform: Platform;
  memberCount: number;
  summary: string;
  about: string;
  icon: string;
  educationOnly: boolean;
  adminName: string;
  adminInitials: string;
  /** The first day of the month the admin was verified. */
  adminVerifiedSince: string;
  rules: [string, string, string];
  inviteUrl: string;
  linkCheckedOn: string;
  adminUnchanged: boolean;
  curationRank: number;
};

export const CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  { key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang', rank: 1 },
  { key: COMMUNITY_CATEGORY.stocks, label: 'Saham', rank: 2 },
  { key: COMMUNITY_CATEGORY.crypto, label: 'Web3/Kripto', rank: 3 },
  { key: COMMUNITY_CATEGORY.financeTalk, label: 'Diskusi Keuangan', rank: 4 },
];

const PRIVACY_RULE = 'Jaga Privasi Sesama Anggota';
const CHECKED_ON = '2026-10-12';

export const CATALOG_GROUPS: readonly CatalogGroup[] = [
  {
    id: 'a49f658c-b80d-43ca-b0c0-4a659130aa6d',
    name: 'Lunas Bareng Jakarta',
    category: COMMUNITY_CATEGORY.debtFree,
    platform: COMMUNITY_PLATFORM.whatsapp,
    memberCount: 1240,
    summary: 'Saling dukung melunasi utang lewat jalur resmi.',
    about:
      'Saling dukung melunasi utang lewat jalur resmi dan berbagi naskah negosiasi, tanpa ajakan gagal bayar.',
    icon: 'paylater',
    educationOnly: false,
    adminName: 'Rani A.',
    adminInitials: 'RA',
    adminVerifiedSince: '2026-03-01',
    rules: ['Tanpa Ajakan Gagal Bayar', 'Tanpa Jual-Beli Data atau Joki', PRIVACY_RULE],
    inviteUrl: 'https://chat.whatsapp.com/J6w5MMRXueBRbTmGiDOI4Z',
    linkCheckedOn: CHECKED_ON,
    adminUnchanged: true,
    curationRank: 1,
  },
  {
    id: 'ab1dc295-80c6-4a2b-9f52-e8ef491cd57c',
    name: 'Belajar Saham dari Nol',
    category: COMMUNITY_CATEGORY.stocks,
    platform: COMMUNITY_PLATFORM.telegram,
    memberCount: 3810,
    summary: 'Dasar saham pelan-pelan, tanpa sinyal beli.',
    about:
      'Belajar dasar saham pelan-pelan, dari membaca laporan keuangan sampai mengenal risiko, tanpa sinyal beli atau rekomendasi saham tertentu.',
    icon: 'saham',
    educationOnly: false,
    adminName: 'Bima P.',
    adminInitials: 'BP',
    adminVerifiedSince: '2026-01-01',
    rules: ['Tanpa Sinyal Beli atau Pom-Pom Saham', 'Afiliasi Wajib Diungkap', PRIVACY_RULE],
    inviteUrl: 'https://t.me/+FTVPdDn7kTgp182n',
    linkCheckedOn: CHECKED_ON,
    adminUnchanged: true,
    curationRank: 2,
  },
  {
    id: 'c561eaaa-b8ec-4c25-adad-e4f27d9548a5',
    name: 'Kripto Aman 101',
    category: COMMUNITY_CATEGORY.crypto,
    platform: COMMUNITY_PLATFORM.discord,
    memberCount: 2050,
    summary: 'Kenali risiko dan modus penipuan kripto.',
    about:
      'Mengenal cara kerja aset kripto, risikonya, dan modus penipuan yang sering muncul. Grup ini untuk edukasi saja, bukan ajakan membeli koin atau token apa pun.',
    icon: 'kripto',
    educationOnly: true,
    adminName: 'Laras W.',
    adminInitials: 'LW',
    adminVerifiedSince: '2026-05-01',
    rules: ['Tanpa Janji Untung Pasti', 'Tanpa Ajakan Beli Koin atau Token', PRIVACY_RULE],
    inviteUrl: 'https://discord.gg/L7OikJMP',
    linkCheckedOn: CHECKED_ON,
    adminUnchanged: true,
    curationRank: 3,
  },
  {
    id: '4352eb2d-f647-46e8-9f8e-27d378efbac5',
    name: 'Ngobrol Gaji Pertama',
    category: COMMUNITY_CATEGORY.financeTalk,
    platform: COMMUNITY_PLATFORM.whatsapp,
    memberCount: 860,
    summary: 'Ngobrol santai soal gaji pertama dan anggaran.',
    about:
      'Ngobrol santai soal gaji pertama, anggaran bulanan, dan dana darurat bareng yang sama-sama baru mulai bekerja.',
    icon: 'gaji',
    educationOnly: false,
    adminName: 'Dimas R.',
    adminInitials: 'DR',
    adminVerifiedSince: '2026-06-01',
    rules: ['Saling Menghargai Cerita Sesama', 'Tanpa Jual-Beli Data atau Joki', PRIVACY_RULE],
    inviteUrl: 'https://chat.whatsapp.com/IGP8zoQ7vKlPN8jnjXwzKf',
    linkCheckedOn: CHECKED_ON,
    adminUnchanged: true,
    curationRank: 4,
  },
];
