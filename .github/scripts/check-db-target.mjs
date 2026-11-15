// Guard target koneksi DB untuk workflow backup.
//
// Kegagalan yang dicegah: secret SUPABASE_DB_URL berisi endpoint DIRECT
// Supabase (db.<ref>.supabase.co) yang IPv6-only — runner GitHub tidak punya
// IPv6 andal, gejalanya timeout acak yang baru ketahuan berjam-jam kemudian.
// pg_dump hanya aman di SESSION POOLER (port 5432); Transaction Pooler
// (port 6543) tidak kompatibel dengan protokol COPY pg_dump.
//
// Script ini TIDAK PERNAH mencetak URL utuh maupun kredensial — hanya
// host + port pada jalur sukses, dan pesan ::error:: yang jelas pada gagal.

const raw = process.env.SUPABASE_DB_URL ?? "";

if (!raw) {
  console.error(
    "::error::Secret SUPABASE_DB_URL kosong/belum diset. Isi dengan connection string SESSION POOLER dari dashboard Supabase (Project Settings > Database > Connection string > Session pooler)."
  );
  process.exit(1);
}

let u;
try {
  u = new URL(raw);
} catch {
  console.error(
    "::error::SUPABASE_DB_URL tidak bisa di-parse sebagai URL. Pastikan formatnya postgresql://... persis dari dashboard Supabase (Session Pooler)."
  );
  process.exit(1);
}

const host = u.hostname;
const port = u.port || "5432";

if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
  console.error(
    `::error::SUPABASE_DB_URL masih memakai endpoint DIRECT (${host}). Endpoint ini IPv6-only dan runner GitHub tidak punya IPv6 andal (gejala: timeout acak seperti run 43695696921). Ganti secret dengan connection string SESSION POOLER: Supabase Dashboard > Project Settings > Database > Connection string > Session pooler (port 5432, tambahkan ?sslmode=require di akhir).`
  );
  process.exit(1);
}

if (!host.endsWith(".pooler.supabase.com")) {
  console.error(
    `::error::Host DB tidak dikenal: ${host}. Yang didukung workflow ini hanya Session Pooler (*.pooler.supabase.com port 5432).`
  );
  process.exit(1);
}

if (port !== "5432") {
  console.error(
    `::error::Host pooler benar (${host}) tapi port ${port}. Port 6543 adalah Transaction Pooler yang TIDAK kompatibel dengan pg_dump. Pakai Session Pooler port 5432.`
  );
  process.exit(1);
}

console.log(`DB target OK: host=${host} port=${port} (session pooler)`);
