/**
 * The Etalase products the Kira team curates (Etalase, DetailProduk and its Konsultasi, E-Book and
 * Event boards), synced into the database at boot by `syncCommunityCatalog`. Their words are the
 * boards'; a free product has no price (Gratis), never Rp0,00.
 */

import { COMMUNITY_PRODUCT_KIND } from '../../lib/constants/community.ts';
import type { ProductKind } from './community.schema.ts';

export type CatalogProduct = {
  id: string;
  kind: ProductKind;
  title: string;
  sellerName: string;
  sellerInitials: string;
  sellerBadge: string;
  sellerRole: string;
  price: number | null;
  icon: string;
  description: string;
  meta: string;
  contentsTitle: string;
  contents: string[];
  affiliate: boolean;
  investmentRisk: boolean;
  sellerUrl: string;
  curationRank: number;
};

const CERTIFIED = 'Perencana Bersertifikat';
const VERIFIED = 'Terverifikasi';

export const CATALOG_PRODUCTS: readonly CatalogProduct[] = [
  {
    id: 'a68e4771-3ba4-4137-9c08-d83275c647d3',
    kind: COMMUNITY_PRODUCT_KIND.course,
    title: 'Kelas Budgeting Gaji Pertama',
    sellerName: 'Raka Aditya',
    sellerInitials: 'RA',
    sellerBadge: CERTIFIED,
    sellerRole: 'Perencana keuangan bersertifikat · 4 kelas',
    price: 149_000,
    icon: 'buku',
    description: 'Belajar membagi gaji pertama ke pos yang jelas, tanpa rumus rumit.',
    meta: '6 modul video',
    contentsTitle: 'Yang Kamu Pelajari',
    contents: [
      'Membagi gaji ke pos kebutuhan, tabungan, dan cicilan',
      'Menyusun budget per periode gajian',
      'Mulai dana darurat dari nominal kecil',
      'Menjaga cicilan tetap di bawah 30% gaji',
    ],
    affiliate: true,
    investmentRisk: false,
    sellerUrl: 'https://lynk.id/rakaaditya/kelas-budgeting-gaji-pertama',
    curationRank: 1,
  },
  {
    id: '1021d075-4ce6-465c-a965-82a1990536a8',
    kind: COMMUNITY_PRODUCT_KIND.consultation,
    title: 'Pendampingan Negosiasi Utang',
    sellerName: 'Dewi Anggraini',
    sellerInitials: 'D',
    sellerBadge: VERIFIED,
    sellerRole: 'Pendamping utang terverifikasi',
    price: null,
    icon: 'kartu-lunas',
    description: 'Didampingi menyusun permintaan keringanan ke pemberi pinjaman.',
    meta: '1 sesi · 45 menit',
    contentsTitle: 'Yang Kamu Dapatkan',
    contents: [
      'Membaca kondisi utangmu bersama-sama',
      'Menyusun naskah keringanan yang realistis',
      'Menentukan urutan pelunasan',
      'Rencana tindak lanjut tertulis',
    ],
    affiliate: true,
    investmentRisk: false,
    sellerUrl: 'https://lynk.id/dewianggraini/pendampingan-negosiasi-utang',
    curationRank: 2,
  },
  {
    id: '8efba7fa-0337-4990-adbb-9e50c4e4f7e4',
    kind: COMMUNITY_PRODUCT_KIND.ebook,
    title: 'E-Book Dana Darurat Keluarga Muda',
    sellerName: 'Sari Wulandari',
    sellerInitials: 'SW',
    sellerBadge: VERIFIED,
    sellerRole: 'Penulis keuangan keluarga',
    price: 49_000,
    icon: 'celengan',
    description: 'Panduan menyiapkan dana darurat untuk keluarga dengan satu atau dua penghasilan.',
    meta: 'PDF · 62 halaman',
    contentsTitle: 'Isi E-Book',
    contents: [
      'Menghitung kebutuhan dana darurat keluarga',
      'Memulai dari nominal kecil tiap gajian',
      'Memisahkan dana darurat dari tabungan lain',
      'Lembar kerja yang bisa dicetak',
    ],
    affiliate: true,
    investmentRisk: false,
    sellerUrl: 'https://lynk.id/sariwulandari/ebook-dana-darurat-keluarga-muda',
    curationRank: 3,
  },
  {
    id: '23111f9a-f2f9-48ec-abd9-c4d5e1e15e56',
    kind: COMMUNITY_PRODUCT_KIND.event,
    title: 'Webinar Keuangan Keluarga Muda',
    sellerName: 'Sari Wulandari',
    sellerInitials: 'SW',
    sellerBadge: VERIFIED,
    sellerRole: 'Penulis keuangan keluarga',
    price: 35_000,
    icon: 'komunitas',
    description: 'Satu sore membahas anggaran, dana darurat, dan proteksi dasar.',
    meta: '14 November 2026 · daring',
    contentsTitle: 'Yang Dibahas',
    contents: [
      'Menyusun anggaran keluarga satu halaman',
      'Menyiapkan dana darurat bertahap',
      'Mengenal proteksi dasar tanpa istilah rumit',
      'Tanya jawab langsung dengan pembicara',
    ],
    affiliate: true,
    investmentRisk: false,
    sellerUrl: 'https://lynk.id/sariwulandari/webinar-keuangan-keluarga-muda',
    curationRank: 4,
  },
];
