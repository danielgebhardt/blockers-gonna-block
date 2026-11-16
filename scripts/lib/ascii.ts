/** ASCII rendering of a puzzle for reports and debugging. */
import type { Puzzle } from '../../src/core/types';

export const COLOR_LETTERS = 'RBGYPO';

export function ascii(p: Puzzle): string {
  const W = p.w + 2;
  const H = p.h + 2;
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const ch = p.grid[y][x];
      g[y + 1][x + 1] = ch === '.' ? '·' : ch === '#' ? '█' : ' ';
    }
  for (let x = 0; x < W; x++) {
    g[0][x] = '─';
    g[H - 1][x] = '─';
  }
  for (let y = 0; y < H; y++) {
    g[y][0] = '│';
    g[y][W - 1] = '│';
  }
  p.gates.forEach((gt) => {
    const ch = gt.colors.map((c) => COLOR_LETTERS[c].toLowerCase()).join('');
    for (let k = gt.start; k < gt.start + gt.len; k++) {
      const c = ch.length > 1 ? '*' : ch;
      if (gt.side === 'N') g[0][k + 1] = c;
      if (gt.side === 'S') g[H - 1][k + 1] = c;
      if (gt.side === 'W') g[k + 1][0] = c;
      if (gt.side === 'E') g[k + 1][W - 1] = c;
    }
  });
  p.blocks.forEach((b) => {
    let ch = COLOR_LETTERS[b.colors[b.colors.length - 1]];
    for (const [dx, dy] of b.cells) g[b.y + dy + 1][b.x + dx + 1] = ch;
  });
  const lines = g.map((r) => r.join(''));
  const legend = p.blocks
    .map((b, i) => {
      const tags = [
        b.colors.map((c) => COLOR_LETTERS[c]).join('>'),
        b.axis ? `axis:${b.axis}` : '',
        b.ice ? `ice:${b.ice}` : '',
      ].filter(Boolean);
      return `#${i}@${b.x},${b.y} ${tags.join(' ')}`;
    })
    .join('  ');
  const gates = p.gates
    .map((g, i) => `g${i}:${g.side}${g.start}+${g.len}=${g.colors.map((c) => COLOR_LETTERS[c]).join('>')}`)
    .join(' ');
  return lines.join('\n') + '\n' + legend + '\n' + gates;
}
