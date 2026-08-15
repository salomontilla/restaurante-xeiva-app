/**
 * Genera los íconos PNG de la PWA.
 *
 * Se escriben a mano con un codificador PNG mínimo (zlib viene con Node) porque en esta
 * máquina no hay ImageMagick ni rsvg-convert, y una PWA sin íconos no se puede instalar
 * en el celular del mesero — que es el punto de toda la fase.
 *
 * Uso:  node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");

// Marca: fondo oscuro cálido con una "X" clara. Legible como favicon de 32px y como
// ícono de escritorio de 512px.
const BG = [23, 23, 23];
const FG = [250, 250, 250];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** pixels: función (x, y) -> [r, g, b] */
function png(size, pixels) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filtro "none" por scanline
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // color truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * La "X" se dibuja con distancia a las dos diagonales. `safe` deja el 10% del borde
 * libre para que el recorte circular de Android (icono maskable) no la muerda.
 */
function xGlyph(size) {
  const stroke = size * 0.11;
  const safe = size * 0.22;

  return (x, y) => {
    const insideSafeArea = x > safe && x < size - safe && y > safe && y < size - safe;
    if (!insideSafeArea) return BG;

    const d1 = Math.abs(x - y) / Math.SQRT2;
    const d2 = Math.abs(x + y - size) / Math.SQRT2;
    return d1 < stroke / 2 || d2 < stroke / 2 ? FG : BG;
  };
}

mkdirSync(OUT, { recursive: true });

for (const size of [192, 512, 180]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, png(size, xGlyph(size)));
  console.log(`✓ ${file}`);
}
