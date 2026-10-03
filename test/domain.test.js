/** 业务规则测试（node --test，零依赖，直接跑 shared/domain.js 纯函数）。 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOp,
  canPerform,
  classifyAgainstPhoto,
  createRug,
  deriveRug,
  markerList,
  mergeMetaPatch,
  publishCard,
  registrationFromAnchors,
  photoToPattern,
  patternToPhoto,
  snapshotAssignments,
  DomainError,
} from "../shared/domain.js";
import { seedState } from "../server/seed.js";

const AT = "2026-10-03T08:00:00.000Z";
const op = (type, extra = {}) => ({ id: `op_${Math.random().toString(36).slice(2)}`, type, at: AT, role: "master", actor: "陈师傅", ...extra });

function freshRug() {
  const state = seedState();
  return { rug: state.rugs[1], cards: state.cards, all: state }; // rug-117：未领线、1 个标记
}

/* 1. 图案坐标 + 登记比例迁移 + 图外标记 -------------------------------- */

test("登记比例由两点算出，且正反映射互逆", () => {
  const reg = registrationFromAnchors(
    { px: 0.2, py: 0.2 },
    { qx: 0.1, qy: 0.1 },
    { px: 0.8, py: 0.6 },
    { qx: 0.7, qy: 0.5 }
  );
  // 照片距离 0.721，纹样距离 0.721 → s=1
  assert.ok(Math.abs(reg.s - 1) < 1e-9);

  const reg2 = registrationFromAnchors(
    { px: 0, py: 0 },
    { qx: 0, qy: 0 },
    { px: 1, py: 0 },
    { qx: 0.9, qy: 0 }
  );
  assert.equal(reg2.s, 0.9);
  const q = photoToPattern(reg2, 1, 1);
  const p = patternToPhoto(reg2, q.qx, q.qy);
  assert.ok(Math.abs(p.px - 1) < 1e-12 && Math.abs(p.py - 1) < 1e-12);
});

test("重拍后标记按图案坐标迁移：inside/partial/outside 分类正确", () => {
  const { rug, cards } = freshRug();
  // 初始全图登记
  rug.registration = { s: 1, ax: 0, ay: 0, qx: 0, qy: 0 };
  const m = markerList(rug)[0]; // rect x .4 w .2 → [.4,.6]
  assert.equal(classifyAgainstPhoto(rug.registration, m.rect), "inside");

  // 新照片取景偏右上：s=0.9，覆盖图案区域 x[0.05..0.95] y[0.05..0.95]
  const reg = { s: 0.9, ax: 0, ay: 0, qx: 0.05, qy: 0.05 };
  assert.equal(classifyAgainstPhoto(reg, m.rect), "inside");

  // 取景只到图案 x 0.5：标记 [.4,.6] 被裁切
  const clip = { s: 0.5, ax: 0, ay: 0, qx: 0, qy: 0 };
  assert.equal(classifyAgainstPhoto(clip, m.rect), "partial");

  // 取景完全在毯子另一侧：标记落到图外
  const away = { s: 0.2, ax: 0, ay: 0, qx: 0.75, qy: 0.75 };
  assert.equal(classifyAgainstPhoto(away, m.rect), "outside");

  // rephoto 操作把状态写到每个标记上
  applyOp(rug, op("rephoto", { rugId: rug.id, photoId: "p2", photoUrl: "/x", registration: away }), cards);
  const migrated = markerList(rug)[0];
  assert.equal(migrated.status, "outside");
  assert.ok(migrated.migration.at === AT);
  // 图案坐标本身不变（变的只是登记）
  assert.equal(migrated.rect.x, 0.4);

  // 图外标记在派生视图中单独列出
  const view = deriveRug(rug, cards);
  assert.equal(view.outsideMarkers.length, 1);
  assert.equal(view.markers[0].status, "outside");
});

test("登记锚点太近时报错", () => {
  assert.throws(
    () => registrationFromAnchors({ px: 0.5, py: 0.5 }, { qx: 0, qy: 0 }, { px: 0.5, py: 0.5000001 }, { qx: 1, qy: 0 }),
    (e) => e instanceof DomainError && e.code === "BAD_ANCHOR"
  );
});

/* 2. 色卡批次：进行中作废重算，完工保留旧批 ---------------------------- */

test("色卡换批：进行中毯子配色跟随新批次，完工毯子冻结当时批次", () => {
  const state = seedState();
  const active = state.rugs[0]; // rug-092 编织中，用了羊毛靛蓝/绯红
  const done = state.rugs[2]; // rug-138 已完工，冻结 batchId 0 / 旧蓝 #274ba0

  const cardsBefore = state.cards.map((c) => ({ ...c }));
  const oldBlue = cardsBefore.find((c) => c.material === "羊毛靛蓝");

  // 发布新蓝色（编号/颜色变化）→ 批次 1 → 2
  const result = publishCard(
    state.cards,
    { material: "羊毛靛蓝", name: "靛蓝（波斯常用）", code: "W-IND-NEW", hex: "#1d4ed8", at: AT },
    state.rugs
  );
  assert.equal(result.changed, true);
  assert.equal(result.card.batchId, oldBlue.batchId + 1);
  assert.deepEqual(result.reconcile.rugIds, ["rug-092"]);
  assert.ok(!result.reconcile.rugIds.includes("rug-138"), "完工毯不参与作废重算");

  state.cards = result.nextCards;

  // 进行中视图：立即变成新颜色/新批次
  const vActive = deriveRug(active, state.cards);
  const blueMarker = vActive.markers.find((x) => x.material === "羊毛靛蓝");
  assert.equal(blueMarker.assignment.hex, "#1d4ed8");
  assert.equal(blueMarker.assignment.status, "valid");
  assert.equal(blueMarker.assignment.batchId, 2);

  // 完工视图：仍然是完工时冻结的旧颜色旧批次
  const vDone = deriveRug(done, state.cards);
  const frozen = vDone.markers[0].assignment;
  assert.equal(frozen.status, "frozen");
  assert.equal(frozen.hex, "#274ba0");
  assert.equal(frozen.batchId, 0);
  assert.equal(frozen.code, "W-IND-OLD");
});

test("色卡颜色没变时不升批次（空发布无副作用）", () => {
  const { cards } = freshRug();
  const result = publishCard(cards, { ...cards[0], at: AT }, []);
  assert.equal(result.changed, false);
  assert.equal(result.card.batchId, cards[0].batchId);
  assert.equal(result.reconcile, null);
});

test("缺失材料的配色显示 missing", () => {
  const { rug, cards } = freshRug();
  rug.markers["mk-x"] = {
    id: "mk-x",
    rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    material: "不存在的材料",
    note: "",
    author: "",
    createdAt: AT,
    updatedAt: AT,
    status: "inside",
  };
  const v = deriveRug(rug, cards);
  assert.equal(v.missingThread, true);
  assert.equal(v.markers.find((m) => m.id === "mk-x").assignment.status, "missing");
});

/* 3. 工序状态机 + 领线 ------------------------------------------------- */

test("没领线不能进编织；补线阶段必须先登记领线", () => {
  const { rug, cards } = freshRug();
  assert.equal(rug.stage, "mend");
  assert.equal(rug.threadIssued, false);
  assert.throws(() => applyOp(rug, op("advance", { rugId: rug.id }), cards), (e) => e instanceof DomainError && e.code === "NO_THREAD");
  assert.equal(rug.stage, "mend");
});

test("领线后可推进：补线→编织→平整；撤销领线从编织退回补线", () => {
  const { rug, cards } = freshRug();
  applyOp(rug, op("setThreadIssued", { rugId: rug.id, issued: true }), cards);
  applyOp(rug, op("advance", { rugId: rug.id }), cards);
  assert.equal(rug.stage, "weave");
  applyOp(rug, op("advance", { rugId: rug.id }), cards);
  assert.equal(rug.stage, "flatten");
  assert.throws(() => applyOp(rug, op("advance", { rugId: rug.id }), cards), (e) => e.code === "BAD_STAGE");

  // 编织阶段没领到线：撤销领线退回上一步「补线」
  rug.stage = "weave";
  applyOp(rug, op("setThreadIssued", { rugId: rug.id, issued: false }), cards);
  assert.equal(rug.stage, "mend", "编织中撤销领线应退回补线");
  assert.equal(rug.threadIssued, false);
});

test("完工必须师傅确认，且完工时冻结色卡快照", () => {
  const state = seedState();
  const rug = state.rugs[0];
  rug.stage = "flatten";
  // 学徒不能完工
  assert.throws(
    () => applyOp(rug, { ...op("complete", { rugId: rug.id }), role: "apprentice", actor: "学徒" }, state.cards),
    (e) => e.code === "FORBIDDEN"
  );
  applyOp(rug, op("complete", { rugId: rug.id }), state.cards);
  assert.equal(rug.stage, "done");
  const snap = snapshotAssignments(rug, state.cards);
  assert.ok(Object.keys(snap).length >= 2);
  for (const s of Object.values(snap)) assert.ok(s.batchId >= 1);

  // 完工后改色卡不影响快照
  const newCards = publishCard(
    state.cards,
    { material: "羊毛靛蓝", name: "靛蓝", code: "W-IND-X", hex: "#000000", at: AT },
    []
  ).nextCards;
  const v = deriveRug(rug, newCards);
  const frozen = v.markers.find((m) => m.material === "羊毛靛蓝").assignment;
  assert.notEqual(frozen.hex, "#000000");
  assert.equal(frozen.status, "frozen");
});

/* 4. 角色权限：学徒只能加标记 ------------------------------------------ */

test("权限矩阵：学徒只能 addMarker，师傅可以执行全部修复操作", () => {
  assert.equal(canPerform("apprentice", "addMarker"), true);
  for (const t of ["updateMarker", "removeMarker", "rephoto", "advance", "complete", "setThreadIssued", "assignMaterial", "updateRug"]) {
    assert.equal(canPerform("apprentice", t), false, `学徒不应能 ${t}`);
    assert.equal(canPerform("master", t), true);
  }
  assert.equal(canPerform("server", "reconcileBatches"), true);
});

test("学徒加标记成功；尝试推进工序被拒且状态不变", () => {
  const { rug, cards } = freshRug();
  const rev0 = rug.rev;
  applyOp(
    rug,
    { id: "op-ap1", type: "addMarker", rugId: rug.id, role: "apprentice", actor: "学徒小李", at: AT, marker: { id: "mk-ap", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } } },
    cards
  );
  assert.ok(rug.markers["mk-ap"]);
  assert.ok(rug.rev > rev0);
  assert.throws(
    () => applyOp(rug, { id: "op-ap2", type: "advance", rugId: rug.id, role: "apprentice", actor: "学徒小李", at: AT }, cards),
    (e) => e.code === "FORBIDDEN"
  );
});

/* 5. 并发：后到不盖先到 + 字段级合并 ----------------------------------- */

test("mergeMetaPatch：不同字段自动合并，同一字段冲突上报", () => {
  const { rug } = freshRug();
  // 假设 A 基于 rev R，服务端在 R+1 改了 origin，R+2 改了 era
  const baseR = 5;
  rug.rev = 7;
  rug.fieldRev = { origin: 6, era: 7 };
  rug.origin = "高加索";
  rug.era = "约1950s";
  rug.note = "";
  const { patch, conflicts } = mergeMetaPatch(baseR, { origin: "波斯", era: "约1950s", note: "我的备注" }, rug);
  // era 值相同不冲突；origin 真冲突；note 服务端没动 → 自动合并
  assert.deepEqual(patch, { era: "约1950s", note: "我的备注" });
  assert.deepEqual(conflicts.map((c) => c.field), ["origin"]);
});

/* 6. 离线事实追加：重复 opId 幂等（服务端层行为在 api_test 中验证） ------ */

test("同一操作重复应用不会产生重复标记", () => {
  const { rug, cards } = freshRug();
  const id = "mk-once";
  const mk = (oid) => ({
    id: oid,
    type: "addMarker",
    rugId: rug.id,
    role: "apprentice",
    actor: "学徒",
    at: AT,
    marker: { id, rect: { x: 0.2, y: 0.2, w: 0.05, h: 0.05 } },
  });
  applyOp(rug, mk("op-1"), cards);
  assert.throws(() => applyOp(rug, mk("op-2"), cards), (e) => e.code === "DUP_OP");
  assert.equal(markerList(rug).filter((m) => m.id === id).length, 1);
});

test("createRug 基本字段与初始阶段", () => {
  const r = createRug({ code: "CAR-X", origin: "高加索" });
  assert.equal(r.stage, "mend");
  assert.equal(r.threadIssued, false);
  assert.equal(r.code, "CAR-X");
  assert.equal(r.rev, 1);
});
