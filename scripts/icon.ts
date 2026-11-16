/**
 * Writes the Android launcher icon and splash as vector drawables (no bitmaps).
 *   npx tsx scripts/icon.ts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const res = join(import.meta.dirname, '../android/app/src/main/res');
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2 * r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2 * r} a${r},${r} 0 0 1 ${r},-${r} z`;
const path = (d: string, fill: string) => `    <path android:fillColor="${fill}" android:pathData="${d}"/>`;

// 4x4 board inside the adaptive-icon safe zone (centre 66 of 108)
const C = 11; // cell
const O = 32; // origin
const cell = (cx: number, cy: number, w: number, h: number, base: string, dark: string) => {
  const x = O + cx * C + 0.8;
  const y = O + cy * C + 0.8;
  const W = w * C - 1.6;
  const H = h * C - 1.6;
  return [path(rr(x, y + 1.2, W, H, 3), dark), path(rr(x, y, W, H - 1, 3), base)].join('\n');
};
const fg = [
  path(rr(O - 4, O - 4, 4 * C + 8, 4 * C + 8, 6), '#2A2F52'),
  path(rr(O, O, 4 * C, 4 * C, 2), '#E9E2D4'),
  // gate on the right (green) beside rows 2..3
  path(rr(O + 4 * C, O + 2 * C + 1, 4, 2 * C - 2, 1.5), '#1FCF8F'),
  cell(0, 0, 1, 2, '#F0476A', '#A8213F'),
  cell(1, 1, 1, 1, '#F0476A', '#A8213F'),
  cell(1, 0, 3, 1, '#3D8BFF', '#1F53B0'),
  cell(2, 1, 2, 1, '#FFC93D', '#C08A0A'),
  cell(0, 2, 2, 2, '#9D63F0', '#6532B0'),
  cell(2, 2, 2, 1, '#1FCF8F', '#0C8A5C'),
  cell(2, 3, 1, 1, '#FF8A3D', '#C0561A'),
].join('\n');

const vector = (body: string, size = 108) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${size}dp" android:height="${size}dp"
    android:viewportWidth="108" android:viewportHeight="108">
${body}
</vector>
`;

// remove bitmap defaults
for (const d of ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  rmSync(join(res, `mipmap-${d}`), { recursive: true, force: true });
  rmSync(join(res, `drawable-land-${d}`), { recursive: true, force: true });
  rmSync(join(res, `drawable-port-${d}`), { recursive: true, force: true });
}
rmSync(join(res, 'drawable/splash.png'), { force: true });
rmSync(join(res, 'drawable-v24'), { recursive: true, force: true });

mkdirSync(join(res, 'drawable'), { recursive: true });
writeFileSync(join(res, 'drawable/ic_launcher_foreground.xml'), vector(fg));
writeFileSync(
  join(res, 'drawable/ic_launcher_background.xml'),
  vector(path('M0,0h108v108h-108z', '#14172B')),
);
writeFileSync(join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#14172B</color>
</resources>
`);
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`;
mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });
writeFileSync(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
writeFileSync(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
// pre-26 fallback: a plain vector (background + foreground)
mkdirSync(join(res, 'mipmap-anydpi'), { recursive: true });
const legacy = vector(path(rr(4, 4, 100, 100, 22), '#14172B') + '\n' + fg, 48);
writeFileSync(join(res, 'mipmap-anydpi/ic_launcher.xml'), legacy);
writeFileSync(join(res, 'mipmap-anydpi/ic_launcher_round.xml'), legacy);
// splash: flat background with the icon in the middle
writeFileSync(join(res, 'drawable/splash_logo.xml'), vector(fg, 160));
writeFileSync(join(res, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="#14172B"/></item>
    <item android:drawable="@drawable/splash_logo" android:gravity="center"/>
</layer-list>
`);
console.log('icon + splash written');
