/**
 * Helper anti-scraping email.
 *
 * Alamat email ditulis TERBALIK di atribut data, lalu dirender ulang oleh
 * JavaScript saat mount. Scraper yang hanya membaca HTML statis (regex
 * `user@domain`) tidak akan menemukan alamat polos. Ini proteksi ringan —
 * JS tetap bisa dibuka oleh manusia yang termotivasi.
 */

export function reverseEmail(email: string): string {
  return email.split("").reverse().join("");
}

export function revealEmail(reversed: string): string {
  return reversed.split("").reverse().join("");
}
