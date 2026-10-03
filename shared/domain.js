/**
 * 地毯修复台 —— 领域核心（前后端共用，纯 ESM，无运行时依赖）
 *
 * 坐标约定
 * --------
 * 图案坐标（pattern space）：以毯子纹样本身为基准的归一化坐标 [0,1]。
 * 照片坐标（photo space）：某张照片像素映射到 [0,1] 的归一化坐标。
 * 重拍之后照片取景不同，两个锚点登记两者的对应关系：
 *
 *   q = s · (p - anchorP) + anchorQ
 *
 * p 为照片坐标，q 为图案坐标，s 即「登记比例」。
 * 破损框只按图案坐标保存；换图后按上式的逆映射回新照片，
 * 因此换相机、换取景都不会丢失标记。
 */

export const STAGES = ["mend", "weave", "flatten", "done"];
export const STAGE_LABEL = {
  mend: "补线",
  weave: "编织",
  flatten: "平整",
  done: "已完工",
};
/** 工序推进顺序：补线 → 编织 → 平整 →（师傅确认）完工 */
export const STAGE_ORDER = ["mend", "weave", "flatten"];

export const ROLES = ["apprentice", "master"];
export const ROLE_LABEL = { apprentice: "学徒", master: "师傅" };

/** 学徒只能加标记；其余操作（改标记、重拍登记、领线、推进、完工、色卡发布）均需师傅。 */
export const PERMISSIONS = {
  apprentice: new Set(["addMarker"]),
  master: new Set([
    "addMarker",
    "updateMarker",
    "removeMarker",
    "rephoto",
    "updateRug",
    "assignMaterial",
    "advance",
    "setThreadIssued",
    "complete",
    "reopen",
  ]),
};

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function canPerform(role, opType) {
  if (role === "server") return true; // 服务端因色卡联动自动追加的系统操作
  return (PERMISSIONS[role] || PERMISSIONS.apprentice).has(opType);
}

let counter = 0;
export function newId(prefix = "id") {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/* ------------------------------------------------------------------ */
/* 登记（registration）与坐标迁移                                       */
/* ------------------------------------------------------------------ */

/**
 * 用两组对应点计算登记比例。
 * p1/p2 为新照片上的两点，q1/q2 为纹样（旧图）上对应的两点。
 * 比例取两组点距离之比；锚点取第一组。
 */
export function registrationFromAnchors(p1, q1, p2, q2) {
  const dp = Math.hypot(p2.px - p1.px, p2.py - p1.py);
  const dq = Math.hypot(q2.qx - q1.qx, q2.qy - q1.qy);
  if (dp < 1e-6) throw new DomainError("BAD_ANCHOR", "新照片上的两个登记点距离太近");
  if (dq < 1e-6) throw new DomainError("BAD_ANCHOR", "纹样上的两个登记点距离太近");
  return { s: dq / dp, ax: p1.px, ay: p1.py, qx: q1.qx, qy: q1.qy };
}

export function photoToPattern(reg, px, py) {
  return { qx: reg.s * (px - reg.ax) + reg.qx, qy: reg.s * (py - reg.ay) + reg.qy };
}

export function patternToPhoto(reg, qx, qy) {
  return { px: reg.ax + (qx - reg.qx) / reg.s, py: reg.ay + (qy - reg.qy) / reg.s };
}

/**
 * 新照片覆盖到的图案区域（可能超出 [0,1]，也可能只是纹样一角）。
 */
export function coveredPatternRect(reg) {
  const a = photoToPattern(reg, 0, 0);
  const b = photoToPattern(reg, 1, 1);
  return {
    x: Math.min(a.qx, b.qx),
    y: Math.min(a.qy, b.qy),
    w: Math.abs(b.qx - a.qx),
    h: Math.abs(b.qy - a.qy),
  };
}

/**
 * 判断一个图案坐标框相对新照片的位置：
 * inside 完整落在新图内 / partial 被新图边缘裁切 / outside 完全在新图外
 */
export function classifyAgainstPhoto(reg, rect) {
  const cov = coveredPatternRect(reg);
  const r = { x: rect.x, y: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h };
  const c = { x: cov.x, y: cov.y, x2: cov.x + cov.w, y2: cov.y + cov.h };
  if (r.x2 < c.x || r.y2 < c.y || r.x > c.x2 || r.y > c.y2) return "outside";
  if (r.x >= c.x && r.y >= c.y && r.x2 <= c.x2 && r.y2 <= c.y2) return "inside";
  return "partial";
}

/** 供界面渲染：图案框 → 新照片上的百分比框 */
export function rectPatternToPhoto(reg, rect) {
  const p0 = patternToPhoto(reg, rect.x, rect.y);
  return { x: p0.px, y: p0.py, w: rect.w / reg.s, h: rect.h / reg.s };
}

/* ------------------------------------------------------------------ */
/* 档案与操作                                                          */
/* ------------------------------------------------------------------ */

export function createRug(input, meta = {}) {
  const now = meta.at || new Date().toISOString();
  return {
    id: input.id || newId("rug"),
    code: input.code || "",
    name: input.name || "",
    origin: input.origin || "",
    era: input.era || "",
    knotDensity: input.knotDensity || "",
    material: input.material || "",
    dyeType: input.dyeType || "",
    note: input.note || "",
    photo: null,
    registration: null,
    markers: {},
    stage: "mend",
    threadIssued: false,
    completedAt: null,
    completedBy: null,
    completionSnapshot: {},
    createdAt: now,
    rev: 1,
    /** 每个文本字段最近一次被改动时的 rev，用于按字段检测并发保存冲突 */
    fieldRev: {},
    recentOps: [],
  };
}

const META_FIELDS = [
  "name",
  "code",
  "origin",
  "era",
  "knotDensity",
  "material",
  "dyeType",
  "note",
];

function recomputeStatuses(doc, registration = doc.registration) {
  if (!registration) return;
  for (const m of Object.values(doc.markers)) {
    m.status = classifyAgainstPhoto(registration, m.rect);
  }
}

/**
 * 把一条操作应用到档案上，返回新的档案（原地修改的浅拷贝由调用方处理；
 * 这里直接在传入对象上改，服务端与客户端各自先拷贝）。
 * 操作是追加式的事实，离线产生的操作也用同一套归并规则。
 */
export function applyOp(doc, op, cards = []) {
  if (!op || !op.type) throw new DomainError("BAD_OP", "缺少操作类型");
  if (op.rugId !== doc.id) throw new DomainError("BAD_OP", "操作与档案不匹配");
  if (!canPerform(op.role || "apprentice", op.type)) {
    throw new DomainError(
      "FORBIDDEN",
      `${ROLE_LABEL[op.role] || op.role}不能执行「${op.type}」`
    );
  }

  switch (op.type) {
    case "addMarker": {
      if (doc.markers[op.marker.id]) throw new DomainError("DUP_OP", "标记已存在");
      const rect = normalizeRect(op.marker.rect);
      doc.markers[op.marker.id] = {
        id: op.marker.id,
        rect,
        material: op.marker.material || "",
        note: op.marker.note || "",
        author: op.actor || "",
        createdAt: op.at,
        updatedAt: op.at,
        status: doc.registration ? classifyAgainstPhoto(doc.registration, rect) : "inside",
      };
      break;
    }
    case "updateMarker": {
      const m = doc.markers[op.markerId];
      if (!m) throw new DomainError("NO_MARKER", "标记不存在");
      if (op.patch.rect) {
        m.rect = normalizeRect(op.patch.rect);
      }
      if (typeof op.patch.material === "string") m.material = op.patch.material;
      if (typeof op.patch.note === "string") m.note = op.patch.note;
      m.updatedAt = op.at;
      m.status = doc.registration ? classifyAgainstPhoto(doc.registration, m.rect) : "inside";
      break;
    }
    case "removeMarker": {
      if (!doc.markers[op.markerId]) throw new DomainError("NO_MARKER", "标记不存在");
      delete doc.markers[op.markerId];
      delete doc.completionSnapshot[op.markerId];
      break;
    }
    case "rephoto": {
      if (!op.registration) throw new DomainError("BAD_OP", "重拍必须附带登记信息");
      doc.photo = { id: op.photoId, url: op.photoUrl, takenAt: op.at };
      doc.registration = op.registration;
      recomputeStatuses(doc);
      for (const m of Object.values(doc.markers)) {
        if (m.status !== "inside") {
          m.migration = { opId: op.id, at: op.at, fromPhotoId: op.prevPhotoId || null };
        }
      }
      break;
    }
    case "updateRug": {
      for (const [k, v] of Object.entries(op.patch || {})) {
        if (!META_FIELDS.includes(k)) continue;
        doc[k] = v;
        doc.fieldRev[k] = doc.rev; // applyXxx 后由调用方 bump，此处记录的是“即将生效”的 rev
      }
      break;
    }
    case "assignMaterial": {
      const m = doc.markers[op.markerId];
      if (!m) throw new DomainError("NO_MARKER", "标记不存在");
      m.material = op.material || "";
      m.updatedAt = op.at;
      break;
    }
    case "setThreadIssued": {
      doc.threadIssued = !!op.issued;
      // 没领到线：编织退回补线（上一步）
      if (!op.issued && doc.stage === "weave") doc.stage = "mend";
      break;
    }
    case "advance": {
      if (doc.stage === "done") throw new DomainError("BAD_STAGE", "毯子已完工");
      if (doc.stage === "mend" && !doc.threadIssued) {
        throw new DomainError("NO_THREAD", "还没有领线登记，不能从补线进入编织");
      }
      const idx = STAGE_ORDER.indexOf(doc.stage);
      if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
        throw new DomainError("BAD_STAGE", "当前工序不能再推进");
      }
      doc.stage = STAGE_ORDER[idx + 1];
      break;
    }
    case "complete": {
      if (doc.stage !== "flatten") throw new DomainError("BAD_STAGE", "平整完成后才能完工确认");
      doc.stage = "done";
      doc.completedAt = op.at;
      doc.completedBy = op.actor || "";
      // 完工瞬间冻结每条补线当时匹配的色卡批次
      doc.completionSnapshot = snapshotAssignments(doc, cards);
      break;
    }
    case "reopen": {
      if (doc.stage !== "done") throw new DomainError("BAD_STAGE", "只有完工档案可以恢复");
      doc.stage = "flatten";
      doc.completedAt = null;
      doc.completedBy = null;
      doc.completionSnapshot = {};
      break;
    }
    case "reconcileBatches": {
      // 配色由色卡派生，档案本身无需改字段；此操作只留下批次作废重算的审计痕迹并推高 rev
      break;
    }
    default:
      throw new DomainError("UNKNOWN_OP", `未知操作：${op.type}`);
  }

  doc.rev += 1;
  if (doc.recentOps.length >= 40) doc.recentOps.shift();
  doc.recentOps.push(summarizeOp(op));
  return doc;
}

function summarizeOp(op) {
  return {
    id: op.id,
    type: op.type,
    at: op.at,
    actor: op.actor || "",
    role: op.role || "",
    detail: opDetail(op),
  };
}

function opDetail(op) {
  switch (op.type) {
    case "addMarker":
      return `新增破损框 ${op.marker.id.slice(-4)}`;
    case "removeMarker":
      return `删除标记 ${op.markerId.slice(-4)}`;
    case "rephoto":
      return `重拍登记，比例 ${op.registration.s.toFixed(3)}，图外 ${op.outsideCount ?? "?"} 个`;
    case "advance":
      return "推进工序";
    case "setThreadIssued":
      return op.issued ? "登记领线" : "领线撤销，退回上一步";
    case "complete":
      return "师傅确认完工，冻结色卡批次";
    case "reopen":
      return "恢复为进行中";
    case "reconcileBatches":
      return `色卡批次变更，作废重算 ${op.changes ? op.changes.length : 0} 处配色`;
    default:
      return "";
  }
}

function normalizeRect(r) {
  const x = Math.min(r.x, r.x + r.w);
  const y = Math.min(r.y, r.y + r.h);
  const w = Math.abs(r.w);
  const h = Math.abs(r.h);
  if (!(w > 0 && h > 0)) throw new DomainError("BAD_RECT", "破损框面积为零");
  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(w),
    h: clamp01(h),
  };
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------------------------ */
/* 配色派生：补线颜色从材料色卡带出                                      */
/* ------------------------------------------------------------------ */

export function cardForMaterial(cards, material) {
  return cards.find((c) => c.active !== false && c.material === material) || null;
}

/** 完工时调用：冻结每条补线所用色卡（含批次号） */
export function snapshotAssignments(doc, cards) {
  const snap = {};
  for (const m of markerList(doc)) {
    if (!m.material) continue;
    const card = cardForMaterial(cards, m.material);
    if (card) {
      snap[m.id] = {
        material: card.material,
        cardId: card.id,
        cardName: card.name,
        code: card.code,
        hex: card.hex,
        batchId: card.batchId,
      };
    }
  }
  return snap;
}

/**
 * 视图模型：把档案 + 当前色卡派生为界面所需结构。
 * - 进行中：配色永远跟随当前色卡批次（批次一改，服务端已追加作废重算记录）。
 * - 已完工：使用 completionSnapshot，保留当时批次与颜色。
 */
export function deriveRug(doc, cards) {
  const done = doc.stage === "done";
  const markers = markerList(doc).map((m) => {
    let assignment = null;
    if (done && doc.completionSnapshot[m.id]) {
      assignment = { ...doc.completionSnapshot[m.id], status: "frozen" };
    } else if (done) {
      assignment = null;
    } else if (m.material) {
      const card = cardForMaterial(cards, m.material);
      assignment = card
        ? {
            material: card.material,
            cardId: card.id,
            cardName: card.name,
            code: card.code,
            hex: card.hex,
            batchId: card.batchId,
            status: "valid",
          }
        : { material: m.material, status: "missing" };
    }
    return { ...m, assignment };
  });

  const outside = markers.filter((m) => m.status === "outside");
  const partial = markers.filter((m) => m.status === "partial");
  const missingThread = markers.some((m) => m.assignment && m.assignment.status === "missing");

  return {
    ...doc,
    markers,
    outsideMarkers: outside,
    partialMarkers: partial,
    stageIndex: STAGE_ORDER.indexOf(doc.stage),
    done,
    missingThread,
    canAdvance:
      doc.stage !== "done" &&
      !(doc.stage === "mend" && !doc.threadIssued) &&
      doc.stage !== "flatten",
    canComplete: doc.stage === "flatten",
    progress: done ? 1 : (STAGE_ORDER.indexOf(doc.stage) + 1) / 3,
  };
}

export function markerList(doc) {
  return Object.values(doc.markers).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 色卡发布。返回 { card, reconcile?:{rugIds, changesByRug} }。
 * 新建色卡：批次 1；已有材料且颜色/编号变化：批次 +1，
 * 所有进行中且用到该材料的毯子作废重算（完工毯不动）。
 */
export function publishCard(cards, input, rugs = []) {
  const now = input.at || new Date().toISOString();
  const idx = cards.findIndex((c) => c.material === input.material);
  let card;
  let changed = false;

  if (idx === -1) {
    card = {
      id: input.id || newId("card"),
      material: input.material,
      name: input.name || input.material,
      code: input.code || "",
      hex: input.hex || "#888888",
      batchId: 1,
      active: true,
      updatedAt: now,
    };
  } else {
    const old = cards[idx];
    changed = old.hex !== input.hex || old.code !== input.code || old.name !== input.name;
    card = {
      ...old,
      name: input.name || old.name,
      code: input.code || old.code,
      hex: input.hex || old.hex,
      batchId: changed ? old.batchId + 1 : old.batchId,
      updatedAt: now,
    };
  }

  const nextCards = idx === -1 ? [...cards, card] : cards.map((c, i) => (i === idx ? card : c));

  let reconcile = null;
  if (changed) {
    const changesByRug = {};
    const rugIds = [];
    for (const rug of rugs) {
      if (rug.stage === "done") continue; // 完工毯保留当时色卡
      const used = markerList(rug)
        .filter((m) => m.material === card.material)
        .map((m) => ({
          markerId: m.id,
          old: { hex: cards[idx].hex, code: cards[idx].code, batchId: cards[idx].batchId },
          next: { hex: card.hex, code: card.code, batchId: card.batchId },
        }));
      if (used.length) {
        changesByRug[rug.id] = used;
        rugIds.push(rug.id);
      }
    }
    reconcile = { rugIds, changesByRug };
  }
  return { card, nextCards, changed, reconcile };
}

/**
 * updateRug 并发保存的字段级合并。
 * 同字段双方都改了 → 冲突，交界面让技师选择；只改了不同字段 → 自动合并。
 * 返回 { patch, conflicts:[{field, localValue, serverValue}] }
 */
export function mergeMetaPatch(entryBaseRev, patch, serverDoc) {
  const auto = {};
  const conflicts = [];
  for (const [field, localValue] of Object.entries(patch)) {
    const changedRev = serverDoc.fieldRev[field] || 0;
    if (changedRev > entryBaseRev && serverDoc[field] !== localValue) {
      conflicts.push({ field, localValue, serverValue: serverDoc[field] });
    } else {
      auto[field] = localValue;
    }
  }
  return { patch: auto, conflicts };
}
