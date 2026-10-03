import type { Carpet, Mark, Stage, StageRecord, Swatch } from "./types";

export const WORK_STAGES: Stage[] = ["补线", "编织", "平整"];

export function nextStage(s: Stage): Stage | null {
  const i = WORK_STAGES.indexOf(s as (typeof WORK_STAGES)[number]);
  if (i < 0) return null;
  return i < WORK_STAGES.length - 1 ? WORK_STAGES[i + 1] : null;
}

export function prevStage(s: Stage): Stage | null {
  const i = WORK_STAGES.indexOf(s as (typeof WORK_STAGES)[number]);
  if (i <= 0) return null;
  return WORK_STAGES[i - 1];
}

export function latestRecord(c: Carpet, stage: Stage): StageRecord | undefined {
  for (let i = c.stageHistory.length - 1; i >= 0; i--) {
    if (c.stageHistory[i].stage === stage) return c.stageHistory[i];
  }
  return undefined;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATTERN_COLORS = ["#7c2d12", "#b45309", "#0f766e", "#9a3412", "#a16207", "#115e59"];

/** 生成程序化地毯纹样 SVG（data URI），不同种子对应不同纹样 */
export function carpetPatternDataUri(seed: number): string {
  const rnd = mulberry32(seed);
  const pick = () => PATTERN_COLORS[Math.floor(rnd() * PATTERN_COLORS.length)];
  const motifs: string[] = [];

  // 四角角隅纹样
  motifs.push(`<path d="M9 9 L24 9 L9 24 Z" fill="${pick()}" opacity="0.85"/>`);
  motifs.push(`<path d="M91 9 L91 24 L76 9 Z" fill="${pick()}" opacity="0.85"/>`);
  motifs.push(`<path d="M9 91 L24 91 L9 76 Z" fill="${pick()}" opacity="0.85"/>`);
  motifs.push(`<path d="M91 91 L76 91 L91 76 Z" fill="${pick()}" opacity="0.85"/>`);

  // 中心团花
  const c1 = pick();
  const c2 = pick();
  motifs.push(`<path d="M50 24 L64 50 L50 76 L36 50 Z" fill="${c1}"/>`);
  motifs.push(`<path d="M50 32 L60 50 L50 68 L40 50 Z" fill="${c2}"/>`);
  motifs.push(`<circle cx="50" cy="50" r="5" fill="#f6efdd"/>`);
  motifs.push(`<circle cx="50" cy="50" r="2.6" fill="${c1}"/>`);

  // 边框联珠
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14;
    const x = 12 + t * 76;
    motifs.push(`<circle cx="${x.toFixed(2)}" cy="7.6" r="1.1" fill="${pick()}" opacity="0.8"/>`);
    motifs.push(`<circle cx="${x.toFixed(2)}" cy="92.4" r="1.1" fill="${pick()}" opacity="0.8"/>`);
  }
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10;
    const y = 12 + t * 76;
    motifs.push(`<circle cx="7.6" cy="${y.toFixed(2)}" r="1.1" fill="${pick()}" opacity="0.8"/>`);
    motifs.push(`<circle cx="92.4" cy="${y.toFixed(2)}" r="1.1" fill="${pick()}" opacity="0.8"/>`);
  }

  // 场地散花
  for (let i = 0; i < 10; i++) {
    const x = 18 + rnd() * 64;
    const y = 18 + rnd() * 64;
    const r = 1.2 + rnd() * 1.6;
    motifs.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${pick()}" opacity="0.55"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
  <rect width="100" height="100" fill="#efe6d2"/>
  <rect x="2.5" y="2.5" width="95" height="95" fill="none" stroke="#7c2d12" stroke-width="1.6"/>
  <rect x="6" y="6" width="88" height="88" fill="none" stroke="#b45309" stroke-width="0.7"/>
  <rect x="9.5" y="9.5" width="81" height="81" fill="#f6efdd"/>
  ${motifs.join("\n  ")}
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 目标色在色卡中按加权距离找最接近的色号 */
export function nearestSwatch(targetHex: string, swatches: Swatch[]): Swatch {
  const [tr, tg, tb] = hexToRgb(targetHex);
  let best = swatches[0];
  let bestD = Infinity;
  for (const s of swatches) {
    const [r, g, b] = hexToRgb(s.hex);
    const d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** 染色类型 → 需配目标色基准 */
export function dyeTargetColor(dyeType: string): string {
  if (dyeType.includes("植物")) return "#3a5a8c";
  if (dyeType.includes("矿物")) return "#8a5a2b";
  return "#7a3b6e";
}

export function jitterColor(hex: string, rnd: () => number, amt = 0.08): string {
  const [r, g, b] = hexToRgb(hex);
  const j = () => (rnd() * 2 - 1) * 255 * amt;
  return rgbToHex(r + j(), g + j(), b + j());
}

export interface PhotoRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  inFrame: boolean;
}

/**
 * 破损框按图案坐标记录；新图按登记比例 s 迁移。
 * 图案坐标 p → 新图坐标 0.5 + (p - 0.5) * s，尺寸同步缩放。
 */
export function markPhotoRect(m: Mark, scale: number): PhotoRect {
  const cx = 0.5 + (m.x - 0.5) * scale;
  const cy = 0.5 + (m.y - 0.5) * scale;
  const w = m.w * scale;
  const h = m.h * scale;
  const inFrame =
    cx - w / 2 >= -1e-6 &&
    cx + w / 2 <= 1 + 1e-6 &&
    cy - h / 2 >= -1e-6 &&
    cy + h / 2 <= 1 + 1e-6;
  return { cx, cy, w, h, inFrame };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
