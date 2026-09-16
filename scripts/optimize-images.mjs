/**
 * Turns the source art in images/ into small WebP files under public/.
 * The originals are ~900KB each; the table only ever draws them at card size.
 * Run with `npm run images` after changing anything in images/.
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const jobs = [
  ...['red', 'orange', 'grey', 'blue', 'purple', 'green'].map((name) => ({
    from: `images/${name}.png`,
    to: `public/masks/${name}.webp`,
    width: 400,
  })),
  { from: 'images/plus 2.png', to: 'public/belts/plus2.webp', width: 480 },
  { from: 'images/plus 1.png', to: 'public/belts/plus1.webp', width: 480 },
  { from: 'images/minus 1.png', to: 'public/belts/minus1.webp', width: 480 },
];

await mkdir('public/masks', { recursive: true });
await mkdir('public/belts', { recursive: true });

for (const job of jobs) {
  const info = await sharp(job.from)
    .trim({ threshold: 1 })
    .resize({ width: job.width, withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(job.to);
  console.log(`${job.to}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)}KB`);
}
