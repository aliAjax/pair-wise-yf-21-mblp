/** 首次启动时写入的演示数据：3 块毯子、3 张材料色卡。 */
import { createRug } from "../shared/domain.js";

export const SEED_CARDS = [
  {
    id: "card-indigo",
    material: "羊毛靛蓝",
    name: "靛蓝（波斯常用）",
    code: "W-IND",
    hex: "#1e3a8a",
    batchId: 1,
    active: true,
    updatedAt: "2026-09-20T08:00:00.000Z",
  },
  {
    id: "card-crimson",
    material: "羊毛绯红",
    name: "石榴绯红",
    code: "W-CRI",
    hex: "#9f1239",
    batchId: 2,
    active: true,
    updatedAt: "2026-09-25T08:00:00.000Z",
  },
  {
    id: "card-gold",
    material: "真丝鎏金",
    name: "鎏金真丝",
    code: "S-GLD",
    hex: "#b45309",
    batchId: 1,
    active: true,
    updatedAt: "2026-09-18T08:00:00.000Z",
  },
];

export function seedState() {
  const rug1 = createRug(
    {
      id: "rug-092",
      code: "CAR-092",
      name: "波斯边缘磨损毯",
      origin: "波斯",
      era: "约1960s",
      knotDensity: "36 结/英寸",
      material: "羊毛",
      dyeType: "植物染",
      note: "边缘磨损待补线",
    },
    { at: "2026-09-28T08:00:00.000Z" }
  );
  rug1.photo = { id: "photo-rug1-v1", url: "/photos/rug1-v1.svg", takenAt: "2026-09-28T08:00:00.000Z" };
  rug1.registration = { s: 1, ax: 0, ay: 0, qx: 0, qy: 0 };
  rug1.markers = {
    "mk-092-1": {
      id: "mk-092-1",
      rect: { x: 0.06, y: 0.62, w: 0.22, h: 0.12 },
      material: "羊毛靛蓝",
      note: "左缘磨断",
      author: "学徒 阿敏",
      createdAt: "2026-09-28T09:00:00.000Z",
      updatedAt: "2026-09-28T09:00:00.000Z",
      status: "inside",
    },
    "mk-092-2": {
      id: "mk-092-2",
      rect: { x: 0.7, y: 0.08, w: 0.16, h: 0.1 },
      material: "羊毛绯红",
      note: "角部缺口",
      author: "学徒 阿敏",
      createdAt: "2026-09-28T09:05:00.000Z",
      updatedAt: "2026-09-28T09:05:00.000Z",
      status: "inside",
    },
  };
  rug1.stage = "weave";
  rug1.threadIssued = true;
  rug1.threadIssuedAt = "2026-09-29T08:00:00.000Z";

  const rug2 = createRug(
    {
      id: "rug-117",
      code: "CAR-117",
      name: "安纳托利亚中心纹样毯",
      origin: "安纳托利亚",
      era: "约1940s",
      knotDensity: "42 结/英寸",
      material: "羊毛",
      dyeType: "植物染",
      note: "中心纹样缺口",
    },
    { at: "2026-09-29T08:00:00.000Z" }
  );
  rug2.photo = { id: "photo-rug2-v1", url: "/photos/rug2-v1.svg", takenAt: "2026-09-29T08:00:00.000Z" };
  rug2.registration = { s: 1, ax: 0, ay: 0, qx: 0, qy: 0 };
  rug2.markers = {
    "mk-117-1": {
      id: "mk-117-1",
      rect: { x: 0.4, y: 0.38, w: 0.2, h: 0.16 },
      material: "真丝鎏金",
      note: "中心葵纹缺口",
      author: "学徒 小周",
      createdAt: "2026-09-29T09:00:00.000Z",
      updatedAt: "2026-09-29T09:00:00.000Z",
      status: "inside",
    },
  };

  const rug3 = createRug(
    {
      id: "rug-138",
      code: "CAR-138",
      name: "藏毯靛蓝褪色毯",
      origin: "藏毯",
      era: "约1970s",
      knotDensity: "30 结/英寸",
      material: "羊毛",
      dyeType: "矿物染",
      note: "局部褪色，需匹配靛蓝色卡；已于去年完工，色卡批次留存",
    },
    { at: "2026-05-10T08:00:00.000Z" }
  );
  rug3.photo = { id: "photo-rug3-v1", url: "/photos/rug3-v1.svg", takenAt: "2026-05-10T08:00:00.000Z" };
  // 上一版照片取景偏右下：登记比例 0.9
  rug3.registration = { s: 0.9, ax: 0.08, ay: 0.1, qx: 0.05, qy: 0.05 };
  rug3.markers = {
    "mk-138-1": {
      id: "mk-138-1",
      rect: { x: 0.12, y: 0.1, w: 0.18, h: 0.14 },
      material: "羊毛靛蓝",
      note: "褪色区（旧色卡批次）",
      author: "师傅 老陈",
      createdAt: "2026-05-11T09:00:00.000Z",
      updatedAt: "2026-05-11T09:00:00.000Z",
      status: "inside",
    },
  };
  rug3.stage = "done";
  rug3.threadIssued = true;
  rug3.completedAt = "2026-06-02T10:00:00.000Z";
  rug3.completedBy = "师傅 老陈";
  rug3.completionSnapshot = {
    "mk-138-1": {
      material: "羊毛靛蓝",
      cardId: "card-indigo",
      cardName: "靛蓝（波斯常用）",
      code: "W-IND-OLD",
      hex: "#274ba0",
      batchId: 0,
    },
  };

  return {
    rugs: [rug1, rug2, rug3],
    cards: SEED_CARDS,
    events: [],
    appliedOpIds: [],
  };
}

/** 演示用纹样照片（SVG），含两个登记锚点十字。 */
export function rugSvg(rugId, variant) {
  const v2 = variant === "v2";
  const bg = v2 ? "#f4ead8" : "#efe3cc";
  const border = v2 ? "#7c2d12" : "#8a3a1c";
  const shift = v2 ? 40 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="${bg}"/>
  <rect x="30" y="30" width="940" height="640" fill="none" stroke="${border}" stroke-width="10"/>
  <rect x="55" y="55" width="890" height="590" fill="none" stroke="#b45309" stroke-width="3" stroke-dasharray="10 8"/>
  <ellipse cx="${500 - shift}" cy="350" rx="180" ry="120" fill="none" stroke="#0f766e" stroke-width="4"/>
  <ellipse cx="${500 - shift}" cy="350" rx="110" ry="72" fill="none" stroke="#0f766e" stroke-width="2"/>
  <path d="M${500 - shift},230 L${560 - shift},350 L${500 - shift},470 L${440 - shift},350 Z" fill="none" stroke="#9f1239" stroke-width="3"/>
  ${Array.from({ length: 9 }, (_, i) => {
    const x = 120 + i * 95;
    return `<path d="M${x},70 l14,18 -14,18 -14,-18 z" fill="#b45309" opacity="0.75"/>
            <path d="M${x},630 l14,18 -14,18 -14,-18 z" fill="#b45309" opacity="0.75"/>`;
  }).join("\n  ")}
  <g stroke="${v2 ? "#000" : "#333"}" stroke-width="2">
    <line x1="${150 - shift}" y1="150" x2="${186 - shift}" y2="150"/><line x1="${168 - shift}" y1="132" x2="${168 - shift}" y2="168"/>
    <line x1="${850 - shift}" y1="550" x2="${886 - shift}" y2="550"/><line x1="${868 - shift}" y1="532" x2="${868 - shift}" y2="568"/>
  </g>
  <text x="60" y="670" font-size="22" fill="#7c2d12" font-family="serif">${rugId} ${v2 ? "重拍版 v2" : "原版 v1"}</text>
</svg>`;
}
