#!/usr/bin/env node
/**
 * Generator OG image 1200x630 — dijalankan OTOMATIS sebagai `postbuild`
 * setelah `npm run build` (lihat package.json).
 *
 * Kenapa postbuild, bukan route Astro:
 *   Adapter @astrojs/cloudflare me-render halaman prerender di workerd.
 *   CanvasKit membutuhkan filesystem Node (font TTF + WASM), yang tidak
 *   tersedia di workerd. Menjalankan skrip ini di Node setelah build
 *   menghasilkan PNG statis tanpa menambah runtime Worker sama sekali.
 *
 * Alur:
 *   1. Pindai seluruh HTML hasil prerender di dist/client.
 *   2. Baca og:image (path /og/...), og:title, og:description, canonical,
 *      application-name, dan meta opsional ogimage:tags/ogimage:date.
 *   3. Render PNG "terminal window" dengan CanvasKit ke dist/client/og/...
 *      — path persis sama dengan og:image (kontrak tidak berubah).
 *
 * Tidak ada judul yang di-hardcode di sini: sumbernya HTML hasil build,
 * jadi halaman baru otomatis ikut selama memakai MainLayout + ogImagePath().
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import CanvasKitInit from "canvaskit-wasm/full";

const ROOT = process.cwd();
const CLIENT_DIR = path.join(ROOT, "dist", "client");
const FONT_REGULAR = path.join(ROOT, "src", "fonts", "JetBrainsMono-Regular.ttf");
const FONT_BOLD = path.join(ROOT, "src", "fonts", "JetBrainsMono-Bold.ttf");

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN_X = 80;
const CONTENT_WIDTH = WIDTH - MARGIN_X * 2;
const BAR_HEIGHT = 56;
const FOOTER_HEIGHT = 90;
const FOOTER_TOP = HEIGHT - FOOTER_HEIGHT;
const CONTENT_TOP = 104;
const CONTENT_BOTTOM = FOOTER_TOP - 22;

const COLORS = {
  bgTop: [8, 10, 14],
  bgBottom: [16, 21, 30],
  panel: [17, 19, 24],
  cyan: [102, 252, 241],
  text: [255, 255, 255],
  muted: [148, 163, 184],
  border: [90, 97, 110],
  red: [255, 77, 109],
  amber: [255, 176, 0],
  green: [51, 255, 102],
};

const FONT_FAMILY = "JetBrains Mono";
const TERMINAL_USER = "indyadirak@portfolio";
const SITE_HOST = "portofolio.indyadirak.com";

let CanvasKit;
let fontMgr;

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

function rgba(rgb, alpha = 1) {
  return CanvasKit.Color(rgb[0], rgb[1], rgb[2], alpha);
}

function textStyle({ size, color, alpha = 1, bold = false, lineHeight = 1.2, letterSpacing }) {
  return new CanvasKit.TextStyle({
    color: rgba(color, alpha),
    fontFamilies: [FONT_FAMILY],
    fontSize: size,
    fontStyle: { weight: bold ? CanvasKit.FontWeight.Bold : CanvasKit.FontWeight.Normal },
    heightMultiplier: lineHeight,
    ...(letterSpacing ? { letterSpacing } : {}),
  });
}

function makeParagraph(text, opts) {
  const style = new CanvasKit.ParagraphStyle({
    textStyle: textStyle(opts),
    textAlign: opts.align ?? CanvasKit.TextAlign.Left,
    textDirection: CanvasKit.TextDirection.LTR,
    ...(opts.maxLines ? { maxLines: opts.maxLines, ellipsis: "…" } : {}),
  });
  const builder = CanvasKit.ParagraphBuilder.Make(style, fontMgr);
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(opts.maxWidth ?? CONTENT_WIDTH);
  return paragraph;
}

function makeMixedParagraph(runs, opts) {
  const base = textStyle(opts);
  const style = new CanvasKit.ParagraphStyle({
    textStyle: base,
    textAlign: opts.align ?? CanvasKit.TextAlign.Left,
    textDirection: CanvasKit.TextDirection.LTR,
    ...(opts.maxLines ? { maxLines: opts.maxLines, ellipsis: "…" } : {}),
  });
  const builder = CanvasKit.ParagraphBuilder.Make(style, fontMgr);
  for (const run of runs) {
    builder.pushStyle(textStyle({ ...opts, ...run }));
    builder.addText(run.text);
  }
  const paragraph = builder.build();
  paragraph.layout(opts.maxWidth ?? CONTENT_WIDTH);
  return paragraph;
}

function fillRect(canvas, x, y, w, h, rgb, alpha = 1) {
  const paint = new CanvasKit.Paint();
  paint.setAntiAlias(true);
  paint.setColor(rgba(rgb, alpha));
  canvas.drawRect(CanvasKit.XYWHRect(x, y, w, h), paint);
  paint.delete();
}

function strokeRect(canvas, x, y, w, h, rgb, alpha = 1, strokeWidth = 1) {
  const paint = new CanvasKit.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(CanvasKit.PaintStyle.Stroke);
  paint.setStrokeWidth(strokeWidth);
  paint.setColor(rgba(rgb, alpha));
  canvas.drawRect(CanvasKit.XYWHRect(x, y, w, h), paint);
  paint.delete();
}

function drawLine(canvas, x0, y0, x1, y1, rgb, alpha = 1, strokeWidth = 1) {
  const paint = new CanvasKit.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(CanvasKit.PaintStyle.Stroke);
  paint.setStrokeWidth(strokeWidth);
  paint.setColor(rgba(rgb, alpha));
  canvas.drawLine(x0, y0, x1, y1, paint);
  paint.delete();
}

function drawCircle(canvas, x, y, radius, rgb, alpha = 1) {
  const paint = new CanvasKit.Paint();
  paint.setAntiAlias(true);
  paint.setColor(rgba(rgb, alpha));
  canvas.drawCircle(x, y, radius, paint);
  paint.delete();
}

function formatDate(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function pageInfo(pathname) {
  const parts = pathname
    .replace(/^\/og\//, "")
    .replace(/\.png$/, "")
    .split("/")
    .map((part) => decodeURIComponent(part));
  const [locale, page, slug] = parts;
  const isEn = locale === "en";
  const base = { locale: isEn ? "en" : "id", slug: slug ?? null };

  if (page === "home") return { ...base, kind: "home", chip: null };
  if (page === "projects") {
    return { ...base, kind: "project-list", chip: isEn ? "PROJECT" : "PROYEK" };
  }
  if (page === "project" && slug) {
    return { ...base, kind: "project-detail", chip: isEn ? "PROJECT" : "PROYEK" };
  }
  if (page === "writeups") {
    return { ...base, kind: "writeup-list", chip: "WRITEUP" };
  }
  if (page === "writeup" && slug) {
    return { ...base, kind: "writeup-detail", chip: "WRITEUP" };
  }
  if (page === "certificates") {
    return {
      ...base,
      kind: "certificates",
      chip: isEn ? "CERTIFICATES" : "SERTIFIKAT",
    };
  }
  return { ...base, kind: "info", chip: "INFO" };
}

function canonicalPath(canonical) {
  try {
    const pathname = decodeURIComponent(new URL(canonical).pathname);
    return pathname === "/" ? "~" : `~${pathname.replace(/\/+$/, "")}`;
  } catch {
    return "~";
  }
}

function footerCommand(info, canonical) {
  const slug = info.slug ?? "";
  switch (info.kind) {
    case "home":
      return "$ whoami";
    case "project-list":
      return "$ ls ~/projects";
    case "project-detail":
      return `$ open ~/projects/${slug}`;
    case "writeup-list":
      return "$ ls ~/writeups";
    case "writeup-detail":
      return `$ cat ~/writeups/${slug}.md`;
    case "certificates":
      return "$ ls ~/certificates";
    default:
      return `$ open ${canonicalPath(canonical)}`;
  }
}

function renderCard(page) {
  const surface = CanvasKit.MakeSurface(WIDTH, HEIGHT);
  if (!surface) throw new Error("CanvasKit.MakeSurface gagal.");
  const canvas = surface.getCanvas();
  const tracked = [];

  const track = (object) => {
    tracked.push(object);
    return object;
  };

  try {
    // ---- Latar gradient vertikal (token situs) ----
    const bgPaint = track(new CanvasKit.Paint());
    const bgShader = CanvasKit.Shader.MakeLinearGradient(
      [0, 0],
      [0, HEIGHT],
      [rgba(COLORS.bgTop), rgba(COLORS.bgBottom)],
      null,
      CanvasKit.TileMode.Clamp
    );
    bgPaint.setShader(bgShader);
    canvas.drawRect(CanvasKit.XYWHRect(0, 0, WIDTH, HEIGHT), bgPaint);
    bgPaint.setShader(null);
    bgShader.delete();

    // ---- Grid 48px di bawah bar ----
    const gridPaint = track(new CanvasKit.Paint());
    gridPaint.setAntiAlias(true);
    gridPaint.setStyle(CanvasKit.PaintStyle.Stroke);
    gridPaint.setStrokeWidth(1);
    gridPaint.setColor(rgba(COLORS.cyan, 0.05));
    for (let x = 0; x <= WIDTH; x += 48) {
      canvas.drawLine(x, BAR_HEIGHT, x, HEIGHT, gridPaint);
    }
    for (let y = BAR_HEIGHT + 48; y <= HEIGHT; y += 48) {
      canvas.drawLine(0, y, WIDTH, y, gridPaint);
    }

    // ---- Semburat radial dari pojok kiri atas ----
    const glowPaint = track(new CanvasKit.Paint());
    const glowShader = CanvasKit.Shader.MakeRadialGradient(
      [0, BAR_HEIGHT],
      720,
      [rgba(COLORS.cyan, 0.1), rgba(COLORS.cyan, 0)],
      [0, 1],
      CanvasKit.TileMode.Clamp
    );
    glowPaint.setShader(glowShader);
    canvas.drawRect(
      CanvasKit.XYWHRect(0, BAR_HEIGHT, WIDTH, HEIGHT - BAR_HEIGHT),
      glowPaint
    );
    glowPaint.setShader(null);
    glowShader.delete();

    // ---- Watermark >_ ----
    const watermark = track(
      makeParagraph(">_", {
        size: 300,
        color: COLORS.cyan,
        alpha: 0.05,
        bold: true,
        lineHeight: 1,
        maxWidth: 600,
        maxLines: 1,
      })
    );
    canvas.drawParagraph(watermark, 900, 275);

    // ---- Bar terminal ----
    fillRect(canvas, 0, 0, WIDTH, BAR_HEIGHT, COLORS.panel);
    drawLine(canvas, 0, BAR_HEIGHT, WIDTH, BAR_HEIGHT, COLORS.border, 0.5);
    drawCircle(canvas, 34, 28, 7, COLORS.red, 0.9);
    drawCircle(canvas, 58, 28, 7, COLORS.amber, 0.9);
    drawCircle(canvas, 82, 28, 7, COLORS.green, 0.9);

    const barPath = page.info.kind === "home" ? "~" : canonicalPath(page.canonical);
    const barText = track(
      makeParagraph(`${TERMINAL_USER}: ${barPath}`, {
        size: 20,
        color: COLORS.muted,
        lineHeight: 1.2,
        maxWidth: WIDTH - 112 - 40,
        maxLines: 1,
      })
    );
    canvas.drawParagraph(barText, 112, (BAR_HEIGHT - barText.getHeight()) / 2);

    // ---- Chip jenis halaman ----
    let cursorY = CONTENT_TOP;
    const chip = page.info.chip;
    if (chip) {
      const padX = 14;
      const padY = 8;
      const chipText = track(
        makeParagraph(chip, {
          size: 20,
          color: COLORS.cyan,
          bold: true,
          lineHeight: 1.2,
          letterSpacing: 1,
          maxWidth: 10000,
          maxLines: 1,
        })
      );
      const chipWidth = chipText.getLongestLine() + padX * 2;
      const chipHeight = chipText.getHeight() + padY * 2;
      strokeRect(canvas, MARGIN_X, cursorY, chipWidth, chipHeight, COLORS.cyan, 0.6, 1);
      canvas.drawParagraph(chipText, MARGIN_X + padX, cursorY + padY);
      cursorY += chipHeight + 26;
    } else {
      cursorY += 8;
    }

    // ---- Judul ----
    const title = clamp(page.title, 110);
    const baseTitleSize = title.length > 90 ? 44 : title.length > 64 ? 52 : 62;
    const description = clamp(page.description, 130);

    const descriptionParagraph = description
      ? track(
          makeParagraph(description, {
            size: 27,
            color: COLORS.muted,
            lineHeight: 1.35,
            maxWidth: CONTENT_WIDTH,
            maxLines: 3,
          })
        )
      : null;

    const metaParagraph = page.metaText
      ? track(
          makeParagraph(page.metaText, {
            size: 22,
            color: COLORS.cyan,
            alpha: 0.8,
            lineHeight: 1.2,
            maxWidth: CONTENT_WIDTH,
            maxLines: 1,
          })
        )
      : null;

    const titleTop = cursorY;
    let titleParagraph = null;
    for (let size = baseTitleSize; size >= 32; size -= 4) {
      const candidate = makeParagraph(title, {
        size,
        color: COLORS.text,
        bold: true,
        lineHeight: 1.15,
        maxWidth: CONTENT_WIDTH,
        maxLines: 3,
      });
      const requiredBottom =
        titleTop +
        candidate.getHeight() +
        18 +
        (descriptionParagraph?.getHeight() ?? 0) +
        (metaParagraph ? 12 + metaParagraph.getHeight() : 0);
      if (requiredBottom <= CONTENT_BOTTOM) {
        titleParagraph = track(candidate);
        break;
      }
      candidate.delete();
    }
    if (!titleParagraph) {
      titleParagraph = track(
        makeParagraph(title, {
          size: 32,
          color: COLORS.text,
          bold: true,
          lineHeight: 1.15,
          maxWidth: CONTENT_WIDTH,
          maxLines: 3,
        })
      );
    }

    canvas.drawParagraph(titleParagraph, MARGIN_X, cursorY);
    cursorY += titleParagraph.getHeight() + 18;

    if (descriptionParagraph) {
      canvas.drawParagraph(descriptionParagraph, MARGIN_X, cursorY);
      cursorY += descriptionParagraph.getHeight();
    }

    if (metaParagraph) {
      cursorY += 12;
      canvas.drawParagraph(metaParagraph, MARGIN_X, cursorY);
      cursorY += metaParagraph.getHeight();
    }

    if (cursorY > CONTENT_BOTTOM) {
      throw new Error(
        `Teks OG melewati batas footer (${cursorY.toFixed(1)} > ${CONTENT_BOTTOM}): ${page.title}`
      );
    }

    // ---- Footer tanda tangan ----
    fillRect(canvas, 0, FOOTER_TOP, WIDTH, FOOTER_HEIGHT, COLORS.panel, 0.92);
    drawLine(canvas, 0, FOOTER_TOP, WIDTH, FOOTER_TOP, COLORS.border, 0.35);

    const command = footerCommand(page.info, page.canonical);
    const commandMaxWidth = 677;
    let commandSize = 23;
    let commandParagraph = null;
    while (commandSize >= 18) {
      const measurement = makeParagraph(command, {
        size: commandSize,
        color: COLORS.muted,
        lineHeight: 1.2,
        maxWidth: 10000,
        maxLines: 1,
      });
      const fits = measurement.getLongestLine() <= commandMaxWidth;
      measurement.delete();
      if (fits) {
        commandParagraph = track(
          makeMixedParagraph(
            [
              { text: "$", color: COLORS.cyan },
              { text: command.slice(1), color: COLORS.text },
            ],
            {
              size: commandSize,
              color: COLORS.text,
              lineHeight: 1.2,
              maxWidth: commandMaxWidth,
              maxLines: 1,
            }
          )
        );
        break;
      }
      commandSize -= 1;
    }
    if (!commandParagraph) {
      commandParagraph = track(
        makeMixedParagraph(
          [
            { text: "$", color: COLORS.cyan },
            { text: command.slice(1), color: COLORS.text },
          ],
          {
            size: 18,
            color: COLORS.text,
            lineHeight: 1.2,
            maxWidth: commandMaxWidth,
            maxLines: 1,
          }
        )
      );
    }
    canvas.drawParagraph(
      commandParagraph,
      MARGIN_X,
      FOOTER_TOP + (FOOTER_HEIGHT - commandParagraph.getHeight()) / 2
    );

    const monogramSize = 46;
    const monogramX = WIDTH - MARGIN_X - monogramSize;
    const monogramY = FOOTER_TOP + (FOOTER_HEIGHT - monogramSize) / 2;
    const urlText = track(
      makeParagraph(SITE_HOST, {
        size: 20,
        color: COLORS.muted,
        lineHeight: 1.2,
        maxWidth: 300,
        maxLines: 1,
        align: CanvasKit.TextAlign.Right,
      })
    );
    const urlRight = monogramX - 14;
    canvas.drawParagraph(
      urlText,
      urlRight - 300,
      FOOTER_TOP + (FOOTER_HEIGHT - urlText.getHeight()) / 2
    );

    strokeRect(canvas, monogramX, monogramY, monogramSize, monogramSize, COLORS.cyan, 1, 1.5);
    const monogram = track(
      makeParagraph("IA", {
        size: 18,
        color: COLORS.cyan,
        bold: true,
        lineHeight: 1,
        maxWidth: monogramSize,
        maxLines: 1,
        align: CanvasKit.TextAlign.Center,
      })
    );
    canvas.drawParagraph(
      monogram,
      monogramX,
      monogramY + (monogramSize - monogram.getHeight()) / 2
    );

    // ---- Bingkai jendela ----
    strokeRect(canvas, 0.5, 0.5, WIDTH - 1, HEIGHT - 1, COLORS.border, 0.35);

    const image = surface.makeImageSnapshot();
    const bytes = image.encodeToBytes(CanvasKit.ImageFormat.PNG, 90);
    image.delete();
    return Buffer.from(bytes);
  } finally {
    for (const object of tracked.reverse()) {
      try {
        object.delete();
      } catch {
        /* ignore */
      }
    }
    surface.dispose();
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
    let title = rawTitle.replace(suffixPattern, "");
    const description = metaContent(html, "og:description") ?? "";
    const info = pageInfo(url.pathname);
    // Chip WRITEUP sudah membawa jenis halaman; buang suffix "— Write-up"
    // agar judul tidak pecah di hyphen dan tidak mengulang jenis.
    if (info.kind === "writeup-detail") {
      title = title.replace(/\s*[—–-]\s*Write-up$/i, "");
    }

    let metaText = null;
    if (info.kind === "project-detail") {
      const tags = metaContent(html, "ogimage:tags");
      if (tags) metaText = tags.split(" · ").slice(0, 3).join(" · ");
    } else if (info.kind === "writeup-detail") {
      const date = metaContent(html, "ogimage:date");
      if (date) metaText = formatDate(date, info.locale);
    }

    jobs.set(url.pathname, {
      title,
      description,
      canonical,
      appName,
      info,
      metaText,
    });
  }

  if (jobs.size === 0) {
    throw new Error(
      "Tidak ada halaman dengan og:image /og/... di dist/client. Pastikan komponen halaman mengirim image={ogImagePath(...)}."
    );
  }

  const startedAt = Date.now();
  const require = createRequire(import.meta.url);
  CanvasKit = await CanvasKitInit({
    locateFile: (file) => require.resolve(`canvaskit-wasm/bin/full/${file}`),
  });

  const regular = await readFile(FONT_REGULAR);
  const bold = await readFile(FONT_BOLD);
  fontMgr = CanvasKit.FontMgr.FromData(regular, bold);
  if (!fontMgr) {
    throw new Error("CanvasKit.FontMgr.FromData gagal memuat JetBrains Mono.");
  }

  let index = 0;
  for (const [pathname, page] of jobs) {
    const outputPath = path.join(CLIENT_DIR, decodeURIComponent(pathname));
    const png = renderCard(page);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png);
    index += 1;
    console.log(`[og] ${index}/${jobs.size} ${pathname}`);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`[og] Selesai: ${jobs.size} gambar dalam ${seconds}s`);
}

await main();
