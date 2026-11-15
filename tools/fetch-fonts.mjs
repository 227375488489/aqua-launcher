// Downloads Manrope + JetBrains Mono (variable, latin + cyrillic) and writes ui/assets/fonts.css
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'ui', 'assets');
const FONTS = join(OUT, 'fonts');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const url =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=JetBrains+Mono:wght@300..600&display=swap';

const css = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text());

mkdirSync(FONTS, { recursive: true });
const wanted = new Set(['latin', 'cyrillic']);
const blocks = css.split('/*');
const faces = [];

for (const chunk of blocks) {
  const subset = chunk.slice(0, chunk.indexOf('*/')).trim();
  if (!wanted.has(subset)) continue;
  const body = chunk.slice(chunk.indexOf('*/') + 2);
  const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
  const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim();
  const src = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
  if (!family || !src) continue;

  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const file = `${slug}-${subset}.woff2`;
  const bytes = Buffer.from(await fetch(src, { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer()));
  writeFileSync(join(FONTS, file), bytes);

  faces.push(
    `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('assets/fonts/${file}') format('woff2');\n  unicode-range: ${range};\n}`
  );
  console.log(file, bytes.length, 'bytes');
}

writeFileSync(join(OUT, 'fonts.css'), faces.join('\n\n') + '\n');
console.log('faces:', faces.length);
