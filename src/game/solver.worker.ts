/// <reference lib="webworker" />
/** Runs the exact solver off the main thread for hints and stuck detection. */
import { type Compiled, compile } from '../core/engine';
import { solve } from '../core/solver';
import type { Puzzle } from '../core/types';

export interface SolveRequest {
  id: number;
  key: string;
  puzzle: Puzzle;
  pos: number[];
  layer: number[];
  maxNodes: number;
}

export interface SolveReply {
  id: number;
  solvable: boolean | null;
  moves: { b: number; a: number; g: number }[];
  nodes: number;
}

const cache = new Map<string, Compiled>();

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const r = e.data;
  let c = cache.get(r.key);
  if (!c) {
    c = compile(r.puzzle);
    cache.set(r.key, c);
  }
  const pos = Int16Array.from(r.pos);
  const state = { pos, layer: Uint8Array.from(r.layer), exits: r.pos.filter((p) => p < 0).length };
  const res = solve(c, state, { maxNodes: r.maxNodes });
  const reply: SolveReply = { id: r.id, solvable: res.solvable, moves: res.imoves, nodes: res.nodes };
  (self as unknown as Worker).postMessage(reply);
};
