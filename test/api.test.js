/**
 * 端到端接口测试：真实启动 HTTP 服务器（独立数据目录 + 随机端口），
 * 覆盖乐观并发、离线操作幂等合并、色卡批次联动、学徒权限、照片上传。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let base;
let child;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rug-test-"));
  // PORT=0 让内核分配空闲端口，避免反复测试时旧进程残留占用固定端口
  base = null;
  let actualPort = 0;
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: "0", RUG_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("服务器启动超时")), 8000);
    child.stdout.on("data", (buf) => {
      const m = /LISTEN (\d+)/.exec(String(buf));
      if (m) {
        actualPort = Number(m[1]);
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => reject(new Error(`服务器提前退出 code=${code}`)));
  });
  base = `http://127.0.0.1:${actualPort}`;
});

test.after(async () => {
  child?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
});

const json = async (p, body) => {
  const res = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const state = async () => (await fetch(`${base}/api/state`)).json();
const oid = () => `op_${Math.random().toString(36).slice(2, 10)}`;

test("学徒在线只能加标记；推进/改档案返回 400 FORBIDDEN", async () => {
  const s = await state();
  const rug = s.rugs.find((r) => r.id === "rug-117");
  const add = await json("/api/rugs/ops", {
    id: oid(),
    type: "addMarker",
    rugId: rug.id,
    role: "apprentice",
    actor: "学徒甲",
    at: new Date().toISOString(),
    marker: { id: "mk-api-ap", rect: { x: 0.1, y: 0.1, w: 0.08, h: 0.08 } },
  });
  assert.equal(add.status, 200);

  const adv = await json("/api/rugs/ops", {
    id: oid(),
    type: "advance",
    rugId: rug.id,
    role: "apprentice",
    actor: "学徒甲",
    at: new Date().toISOString(),
  });
  assert.equal(adv.status, 400);
  assert.equal(adv.body.error, "FORBIDDEN");
});

test("两个技师同时保存：后到 baseRev 过期 → 409，不覆盖先到", async () => {
  const s = await state();
  const rug = s.rugs.find((r) => r.id === "rug-117");
  const rev = rug.rev;

  const first = await json("/api/rugs/ops", {
    id: oid(),
    type: "updateRug",
    rugId: rug.id,
    role: "master",
    actor: "早班陈师傅",
    at: new Date().toISOString(),
    baseRev: rev,
    patch: { note: "早班先保存的备注" },
  });
  assert.equal(first.status, 200);

  const second = await json("/api/rugs/ops", {
    id: oid(),
    type: "updateRug",
    rugId: rug.id,
    role: "master",
    actor: "晚班李师傅",
    at: new Date().toISOString(),
    baseRev: rev, // 仍然基于旧版本
    patch: { note: "晚班后到的备注" },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "REV_CONFLICT");

  const s2 = await state();
  assert.equal(s2.rugs.find((r) => r.id === rug.id).note, "早班先保存的备注");
});

test("离线归来 /api/sync：不同字段自动合并，同字段返回 conflicts；重复 opId 幂等", async () => {
  const s = await state();
  const rug = s.rugs.find((r) => r.id === "rug-117");
  const baseRev = rug.rev;

  // 离线期间服务端先被别人改了 note（模拟另一班次在晚班离线时保存）
  await json("/api/rugs/ops", {
    id: oid(),
    type: "updateRug",
    rugId: rug.id,
    role: "master",
    actor: "另一班次",
    at: new Date().toISOString(),
    baseRev: rug.rev,
    patch: { note: "另一班次改了备注" },
  });

  const dupId = oid();
  const sync = await json("/api/sync", {
    ops: [
      // 事实操作：加标记（离线时学徒也能做）
      {
        id: dupId,
        type: "addMarker",
        rugId: rug.id,
        role: "apprentice",
        actor: "离线学徒",
        at: new Date().toISOString(),
        marker: { id: "mk-offline-1", rect: { x: 0.2, y: 0.2, w: 0.05, h: 0.05 }, note: "离线标的" },
      },
      // 同一条再发一遍（断网重连重试）→ 幂等
      {
        id: dupId,
        type: "addMarker",
        rugId: rug.id,
        role: "apprentice",
        actor: "离线学徒",
        at: new Date().toISOString(),
        marker: { id: "mk-offline-1", rect: { x: 0.2, y: 0.2, w: 0.05, h: 0.05 }, note: "离线标的" },
      },
      // 文本保存：era 无竞争自动合并；note 双方都改 → 冲突
      {
        id: oid(),
        type: "updateRug",
        rugId: rug.id,
        role: "master",
        actor: "晚班离线",
        at: new Date().toISOString(),
        baseRev,
        patch: { era: "约1935s", note: "晚班离线时写的备注" },
      },
    ],
  });
  assert.equal(sync.status, 200);
  assert.ok(sync.body.results.some((r) => r.duplicate), "重复 opId 应被识别为幂等");
  assert.equal(sync.body.conflicts.length, 1);
  assert.equal(sync.body.conflicts[0].conflicts[0].field, "note");

  const s2 = await state();
  const r2 = s2.rugs.find((r) => r.id === rug.id);
  assert.equal(r2.era, "约1935s", "无竞争字段自动合并");
  assert.equal(r2.note, "另一班次改了备注", "冲突字段保留先到的值");
  assert.ok(r2.markers["mk-offline-1"], "离线标记补录成功");
  assert.equal(Object.values(r2.markers).filter((m) => m.id === "mk-offline-1").length, 1);

  // 再同步一次：所有 opId 都已存在，全部幂等
  const sync2 = await json("/api/sync", {
    ops: [{ id: dupId, type: "addMarker", rugId: rug.id, role: "apprentice", actor: "x", at: new Date().toISOString(), marker: { id: "mk-offline-1", rect: { x: 0.2, y: 0.2, w: 0.05, h: 0.05 } } }],
  });
  assert.equal(sync2.status, 200);
  assert.ok(sync2.body.results[0].duplicate);
});

test("没领线不能推进编织；登记领线后工序前进；撤销领线退回补线", async () => {
  // 用新建毯子避免和别的用例抢状态
  const created = await json("/api/rugs", { code: "CAR-T1", name: "工序测试毯", origin: "高加索" });
  const id = created.body.rug.id;

  const bad = await json("/api/rugs/ops", {
    id: oid(), type: "advance", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString(),
  });
  assert.equal(bad.body.error, "NO_THREAD");

  await json("/api/rugs/ops", { id: oid(), type: "setThreadIssued", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString(), issued: true });
  await json("/api/rugs/ops", { id: oid(), type: "advance", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString() });
  let s = await state();
  assert.equal(s.rugs.find((r) => r.id === id).stage, "weave");

  // 没领到线：撤销 → 退回补线
  await json("/api/rugs/ops", { id: oid(), type: "setThreadIssued", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString(), issued: false });
  s = await state();
  const r = s.rugs.find((x) => x.id === id);
  assert.equal(r.stage, "mend");
  assert.equal(r.threadIssued, false);
});

test("色卡换批：进行中毯子自动追加作废重算，完工毯批次不变", async () => {
  // 新毯用羊毛靛蓝
  const created = await json("/api/rugs", { code: "CAR-T2", name: "配色测试毯", origin: "波斯" });
  const id = created.body.rug.id;
  let s = await state();
  const rev0 = s.rugs.find((r) => r.id === id).rev;
  await json("/api/rugs/ops", {
    id: oid(), type: "addMarker", rugId: id, role: "apprentice", actor: "学徒", at: new Date().toISOString(),
    marker: { id: "mk-c", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, material: "羊毛靛蓝" },
  });

  const pub = await json("/api/cards", {
    role: "master", material: "羊毛靛蓝", name: "靛蓝（波斯常用）", code: "W-IND-2026", hex: "#102a63",
  });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.changed, true);
  const effect = pub.body.sideEffects.find((x) => x.rugId === id);
  assert.ok(effect, "用该材料的进行中毯子应收到批次作废重算");
  assert.equal(effect.changes[0].next.hex, "#102a63");

  s = await state();
  const rug = s.rugs.find((r) => r.id === id);
  assert.ok(rug.rev > rev0 + 1, "服务端自动 reconcile 操作推高 rev");
  assert.ok(rug.recentOps.some((o) => o.type === "reconcileBatches"));

  // 完工毯 rug-138 不受影响
  const done = s.rugs.find((r) => r.id === "rug-138");
  assert.equal(done.completionSnapshot["mk-138-1"].hex, "#274ba0");
  assert.ok(!pub.body.sideEffects.some((x) => x.rugId === "rug-138"));

  // 学徒不能发布色卡
  const forbid = await json("/api/cards", { role: "apprentice", material: "x", code: "y", hex: "#fff" });
  assert.equal(forbid.body.error, "FORBIDDEN");
});

test("重拍登记：图外标记计数正确且标记坐标仍是图案坐标", async () => {
  const created = await json("/api/rugs", { code: "CAR-T3", name: "迁移测试毯", origin: "藏毯" });
  const id = created.body.rug.id;
  await json("/api/rugs/ops", {
    id: oid(), type: "addMarker", rugId: id, role: "apprentice", actor: "学徒", at: new Date().toISOString(),
    marker: { id: "mk-a", rect: { x: 0.05, y: 0.05, w: 0.06, h: 0.06 } },
  });
  await json("/api/rugs/ops", {
    id: oid(), type: "addMarker", rugId: id, role: "apprentice", actor: "学徒", at: new Date().toISOString(),
    marker: { id: "mk-b", rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
  });
  // 首次登记（师傅）
  await json("/api/rugs/ops", {
    id: oid(), type: "rephoto", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString(),
    photoId: "ph-1", photoUrl: "/photos/ph-1.svg",
    registration: { s: 1, ax: 0, ay: 0, qx: 0, qy: 0 },
  });
  // 重拍取景右下角小块：覆盖图案 [0.6..0.9]
  const rep = await json("/api/rugs/ops", {
    id: oid(), type: "rephoto", rugId: id, role: "master", actor: "陈师傅", at: new Date().toISOString(),
    photoId: "ph-2", photoUrl: "/photos/ph-2.svg", prevPhotoId: "ph-1",
    registration: { s: 0.3, ax: 0, ay: 0, qx: 0.6, qy: 0.6 },
  });
  assert.equal(rep.status, 200);
  const repLogs = rep.body.rug.recentOps.filter((o) => o.type === "rephoto");
  const opLog = repLogs[repLogs.length - 1];
  assert.ok(opLog.detail.includes("图外 1"), opLog.detail);
  const s = await state();
  const rug = s.rugs.find((r) => r.id === id);
  assert.equal(rug.markers["mk-a"].status, "outside");
  assert.equal(rug.markers["mk-b"].status, "partial", "mk-b 与取景边缘相切，按裁切处理");
  assert.equal(rug.markers["mk-a"].rect.x, 0.05, "图案坐标不被重拍改写");
});

test("照片 dataURL 可以上传并回读", async () => {
  const tiny =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const up = await json("/api/photos", { dataUrl: tiny });
  assert.equal(up.status, 200);
  const r = await fetch(`${base}${up.body.url}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
});
