#!/usr/bin/env node
/**
 * Generator OG image 1200x630 — dijalankan OTOMATIS sebagai `postbuild`
 * setelah `npm run build` (lihat package.json).
 *
 * Kenapa postbuild, bukan route Astro:
 *   Adapter @astrojs/cloudflare me-render halaman prerender di workerd.
 *   astro-og-canvas membutuhkan filesystem Node (font TTF) + CanvasKit,
 *   yang tidak tersedia di workerd. Menjalankan skrip ini di Node setelah
 *   build menghasilkan PNG statis tanpa menambah runtime Worker sama sekali.
 *
 * Alur:
 *   1. Pindai seluruh HTML hasil prerender di dist/client.
 *   2. Baca og:image (path /og/...), og:title, og:description, canonical,
 *      dan application-name dari meta yang sudah ditulis MainLayout.
 *   3. Render PNG dengan identitas terminal (gelap, aksen cyan, JetBrains
 *      Mono) ke dist/client/og/... — path persis sama dengan og:image.
 *
 * Tidak ada judul yang di-hardcode di sini: sumbernya HTML hasil build,
 * jadi halaman baru otomatis ikut selama memakai MainLayout + ogImagePath().
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateOpenGraphImage } from "astro-og-canvas";

const ROOT = process.cwd();
const CLIENT_DIR = path.join(ROOT, "dist", "client");
const CACHE_DIR = path.join(ROOT, "node_modules", ".astro-og-canvas");
const FONTS = [
  path.join(ROOT, "src", "fonts", "JetBrainsMono-Regular.ttf"),
  path.join(ROOT, "src", "fonts", "JetBrainsMono-Bold.ttf"),
];

const CYAN = [102, 252, 241];
const TEXT = [255, 255, 255];
const MUTED = [148, 163, 184];

/** Decode entitas HTML yang umum pada atribut meta. */
function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
  });
}

/** Ambil atribut content dari <meta property|name="key">. */
function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  )?.[0];
  if (!tag) return null;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

function linkHref(html, rel) {
  const tag = html.match(
    new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, "i")
  )?.[0];
  return tag?.match(/href=["']([^"']*)["']/i)?.[1] ?? null;
}

function clamp(value, max) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function main() {
  try {
    await readdir(CLIENT_DIR);
  } catch {
    throw new Error(
      `Direktori ${CLIENT_DIR} tidak ditemukan. Jalankan lewat "npm run build" (postbuild) setelah Astro build sukses.`
    );
  }

  const jobs = new Map();

  for await (const file of walk(CLIENT_DIR)) {
    if (!file.endsWith(".html")) continue;
    const html = await readFile(file, "utf8");
    const imageUrl = metaContent(html, "og:image");
    if (!imageUrl) continue;

    let url;
    try {
      url = new URL(imageUrl);
    } catch {
      continue;
    }
    if (!url.pathname.startsWith("/og/") || !url.pathname.endsWith(".png")) continue;
    if (jobs.has(url.pathname)) continue;

    const appName = metaContent(html, "application-name") ?? "IndyAdiraK";
    const canonical = linkHref(html, "canonical") ?? url.href;
    const rawTitle = metaContent(html, "og:title") ?? "";
    // MainLayout menambahkan " — <site>" pada judul non-home. Buang suffix
    // itu agar kartu tidak menampilkan nama situs dua kali (judul + baris
    // identitas). Terima em dash, en dash, maupun hyphen.
    const suffixPattern = new RegExp(`\\s*[—–-]\\s*${escapeRegExp(appName)}$`);
    const title = rawTitle.replace(suffixPattern, "");
    const description = metaContent(html, "og:description") ?? "";

    jobs.set(url.pathname, { title, description, canonical, appName });
  }

  if (jobs.size === 0) {
    throw new Error(
      "Tidak ada halaman dengan og:image /og/... di dist/client. Pastikan komponen halaman mengirim image={ogImagePath(...)}."
    );
  }

  const startedAt = Date.now();
  let index = 0;

  for (const [pathname, page] of jobs) {
    const outputPath = path.join(CLIENT_DIR, decodeURIComponent(pathname));
    const title = clamp(page.title, 110);
    // Judul panjang dikecilkan agar tetap muat bersama deskripsi + URL
    // (kanvas 1200x630, font mono lebar). Ambang sengaja konservatif.
    const titleSize = title.length > 90 ? 44 : title.length > 64 ? 52 : 62;
    const png = await generateOpenGraphImage({
      title,
      // Baris identitas: nama situs + URL kanonik halaman.
      description: `${clamp(page.description, 130)}\n\n$ ${page.appName} · ${page.canonical}`,
      bgGradient: [
        [8, 10, 14],
        [16, 21, 30],
      ],
      border: { color: CYAN, width: 6, side: "inline-start" },
      padding: 70,
      font: {
        title: {
          color: TEXT,
          size: titleSize,
          weight: "Bold",
          lineHeight: 1.15,
          families: ["JetBrains Mono"],
        },
        description: {
          color: MUTED,
          size: 27,
          weight: "Normal",
          lineHeight: 1.35,
          families: ["JetBrains Mono"],
        },
      },
      fonts: FONTS,
      cacheDir: CACHE_DIR,
    });

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png);
    index += 1;
    console.log(`[og] ${index}/${jobs.size} ${pathname}`);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`[og] Selesai: ${jobs.size} gambar dalam ${seconds}s`);
}

await main();
