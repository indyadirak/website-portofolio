/**
 * Utilitas tanggal untuk validasi input admin.
 *
 * DB menyimpan kolom `date` (Postgres) — format kanonik YYYY-MM-DD dan
 * WAJIB valid secara kalender (2026-02-30 ditolak Postgres dengan error
 * samar yang di API tampil sebagai db_operation_failed). Helper ini
 * memvalidasi + menormalisasi SEBELUM menyentuh DB agar pesan error jelas
 * dan responsif (400, bukan 403).
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** true bila string YYYY-MM-DD ada di kalender nyata & tahun wajar. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d || y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalisasi input tanggal bebas -> ISO YYYY-MM-DD, atau null bila tidak
 * valid. Menerima: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY.
 * Ambiguitas 02/03/2024 diselesaikan heuristik: bila bagian pertama >12
 * pasti hari (DD/MM); bila bagian kedua >12 pasti format MM/DD.
 */
export function normalizeDateInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidIsoDate(value) ? value : null;
  }

  const slashed = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) {
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    const y = Number(slashed[3]);
    let month: number;
    let day: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      month = a;
      day = b;
    }
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  return null;
}

/** true bila `from` <= `to` (keduanya ISO tervalidasi). */
export function isDateRangeValid(fromIso: string, toIso: string): boolean {
  return fromIso <= toIso;
}
