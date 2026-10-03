/**
 * 修复台同步服务器（零依赖）。
 *
 * 并发模型
 * --------
 * 全部写操作进入 store.mutate 串行队列；每条修改类操作带 baseRev：
 *   - 操作以「事实追加」为主（加标记、推进、领线……），两班技师的事实都保留；
 *   - updateRug/updateMarker 带乐观版本：你基于的 rev 已落后 → 409，
 *     updateRug 额外返回字段级冲突/可自动合并的字段（mergeMetaPatch）；
 *   - 离线归来的成批操作走 /api/sync：重复操作（同 opId）幂等跳过，
 *     事实操作直接补录，冲突的文本保存返回 conflicts 由界面选边。
 */
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { seedState, rugSvg } from "./seed.js";
import {
  applyOp,
  canPerform,
  classifyAgainstPhoto,
  createRug,
  mergeMetaPatch,
  newId,
  publishCard,
  DomainError,
} from "../shared/domain.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.RUG_DATA_DIR || path.join(ROOT, ".data");
const DIST_DIR = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 62009);

const store = new Store(DATA_DIR);
const META_KEYS = new Set(["name", "code", "origin", "era", "knotDensity", "material", "dyeType", "note"]);

function send(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(data);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 12 * 1024 * 1024) reject(new Error("请求体过大"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}
function fail(res, err) {
  if (err instanceof DomainError) return send(res, 400, { error: err.code, message: err.message });
  return send(res, 500, { error: "INTERNAL", message: err.message });
}
function getRug(state, id) {
  const rug = state.rugs.find((r) => r.id === id);
  if (!rug) throw new DomainError("NO_RUG", "档案不存在");
  return rug;
}
async function recordEvent(state, op) {
  const ev = { id: op.id, rugId: op.rugId || null, type: op.type, at: op.at, actor: op.actor || "" };
  state.events.push(ev);
  if (state.events.length > 20000) state.events = state.events.slice(-12000);
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    /* 静态：照片 */
    if (p.startsWith("/photos/")) {
      const file = path.join(store.photoDir, path.posix.basename(p));
      const data = await fs.readFile(file).catch(() => null);
      if (!data) return send(res, 404, { error: "NO_PHOTO" });
      const ext = path.extname(file).slice(1);
      res.writeHead(200, { "content-type": ext === "svg" ? "image/svg+xml" : `image/${ext}` });
      return res.end(data);
    }

    /* 静态：构建产物 */
    if (p.startsWith("/assets/") || p === "/sw.js" || p === "/manifest.webmanifest") {
      return serveStatic(res, p, req);
    }
    if (p === "/" || p === "/index.html") {
      return serveStatic(res, "/index.html", req);
    }

    // 其余非 API 的 GET 请求：找静态文件，找不到回退 index.html（单页应用）
    if (req.method === "GET" && !p.startsWith("/api/")) {
      return serveStatic(res, p, req);
    }

    if (!p.startsWith("/api/")) return send(res, 404, { error: "NOT_FOUND" });

    /* ---------------- API ---------------- */
    if (p === "/api/state" && req.method === "GET") {
      return store.mutate(async (state) => send(res, 200, snapshot(state)));
    }

    if (p === "/api/rugs" && req.method === "POST") {
      const body = await readJson(req);
      return store.mutate(async (state) => {
        const rug = createRug(body);
        if (state.rugs.some((r) => r.code === rug.code && rug.code)) {
          throw new DomainError("DUP_CODE", "档案编号已存在");
        }
        state.rugs.push(rug);
        await store.persist();
        send(res, 200, { rug });
      }).catch((e) => fail(res, e));
    }

    if (p === "/api/photos" && req.method === "POST") {
      const body = await readJson(req);
      const id = newId("photo");
      const url2 = await store.savePhoto(id, body.dataUrl);
      await store.mutate(async () => {});
      return send(res, 200, { photoId: id, url: url2 });
    }

    if (p === "/api/cards" && req.method === "POST") {
      const body = await readJson(req);
      return store
        .mutate(async (state) => {
          if (body.role !== "master") throw new DomainError("FORBIDDEN", "只有师傅可以发布色卡");
          const { nextCards, changed, reconcile } = publishCard(state.cards, body, state.rugs);
          state.cards = nextCards;
          const sideEffects = [];
          if (reconcile) {
            for (const rug of state.rugs) {
              if (!reconcile.rugIds.includes(rug.id)) continue;
              const op = {
                id: newId("op"),
                type: "reconcileBatches",
                rugId: rug.id,
                role: "server",
                actor: "色卡联动",
                at: new Date().toISOString(),
                changes: reconcile.changesByRug[rug.id],
              };
              const draft = structuredCloneSafe(rug);
              applyOp(draft, op, state.cards);
              Object.assign(rug, draft);
              store.rememberOp(op.id);
              recordEvent(state, op);
              sideEffects.push({ rugId: rug.id, rev: rug.rev, changes: op.changes });
            }
          }
          await store.persist();
          send(res, 200, { card: nextCards.find((c) => c.material === body.material), changed, sideEffects });
        })
        .catch((e) => fail(res, e));
    }

    if (p === "/api/rugs/ops" && req.method === "POST") {
      const op = await readJson(req);
      return store
        .mutate(async (state) => {
          if (op.type === "rephoto" && op.photoDataUrl) {
            const photoId = op.photoId || newId("photo");
            op.photoId = photoId;
            op.photoUrl = await store.savePhoto(photoId, op.photoDataUrl);
            delete op.photoDataUrl;
          }
          const rug = getRug(state, op.rugId);
          const outsideCount =
            op.type === "rephoto" && op.registration
              ? countOutsideAfter(state, op)
              : undefined;
          if (op.type === "rephoto") op.outsideCount = outsideCount;
          const draft = structuredCloneSafe(rug);
          // 先试跑校验（权限、工序、登记等）
          const beforeRev = rug.rev;
          if (!op.id) op.id = newId("op");
          if (!op.at) op.at = new Date().toISOString();
          if (store.hasOp(op.id)) return send(res, 200, { duplicate: true, opId: op.id, rug });
          if (!canPerform(op.role || "apprentice", op.type)) {
            throw new DomainError("FORBIDDEN", "当前角色无权执行该操作");
          }
          if (typeof op.baseRev === "number" && op.baseRev !== beforeRev) {
            const err = new DomainError(
              "REV_CONFLICT",
              `版本冲突：本地 rev ${op.baseRev}，服务端 rev ${beforeRev}。请先拉取合并再保存。`
            );
            err.status = 409;
            throw err;
          }
          applyOp(draft, op, state.cards);
          if (op.type === "updateRug") {
            for (const k of Object.keys(op.patch || {})) {
              if (META_KEYS.has(k)) draft.fieldRev[k] = draft.rev;
            }
          }
          Object.assign(rug, draft);
          store.rememberOp(op.id);
          recordEvent(state, op);
          await store.persist();
          send(res, 200, { ok: true, opId: op.id, rug: snapshot(state).rugs.find((r) => r.id === rug.id) });
        })
        .catch((e) => {
          const status = e.status || (e instanceof DomainError ? 400 : 500);
          send(res, status, { error: e.code || "INTERNAL", message: e.message });
        });
    }

    if (p === "/api/sync" && req.method === "POST") {
      const { since, ops = [], cards = [] } = await readJson(req);
      return store
        .mutate(async (state) => {
          const results = [];
          const conflicts = [];

          // 1) 离线期间发布过的色卡（师傅离线也可先发布到队列）
          for (const c of cards) {
            const existing = state.cards.find((x) => x.material === c.material);
            const body = { ...c, role: "master" };
            const { nextCards, changed, reconcile } = publishCard(state.cards, body, state.rugs);
            state.cards = nextCards;
            results.push({ kind: "card", material: c.material, changed, batchId: nextCards.find((x) => x.material === c.material).batchId });
            if (reconcile) {
              for (const rug of state.rugs) {
                if (!reconcile.rugIds.includes(rug.id)) continue;
                const op = {
                  id: newId("op"),
                  type: "reconcileBatches",
                  rugId: rug.id,
                  role: "server",
                  actor: "色卡联动（离线合并）",
                  at: new Date().toISOString(),
                  changes: reconcile.changesByRug[rug.id],
                };
                const draft = structuredCloneSafe(rug);
                applyOp(draft, op, state.cards);
                Object.assign(rug, draft);
                store.rememberOp(op.id);
                recordEvent(state, op);
              }
            }
          }

          // 2) 离线操作：事实追加；文本保存做字段级合并
          for (const op of ops) {
            try {
              if (op.type === "rephoto" && op.photoDataUrl) {
                const photoId = op.photoId || newId("photo");
                op.photoId = photoId;
                op.photoUrl = await store.savePhoto(photoId, op.photoDataUrl);
                delete op.photoDataUrl;
              }
              const rug = getRug(state, op.rugId);
              if (!op.id) op.id = newId("op");
              if (!op.at) op.at = new Date().toISOString();
              if (store.hasOp(op.id)) {
                results.push({ kind: "op", opId: op.id, duplicate: true });
                continue;
              }
              if (!canPerform(op.role || "apprentice", op.type)) {
                throw new DomainError("FORBIDDEN", "当前角色无权执行该操作");
              }

              if (op.type === "updateRug" && typeof op.baseRev === "number" && op.baseRev !== rug.rev) {
                const { patch, conflicts: cf } = mergeMetaPatch(op.baseRev, op.patch || {}, rug);
                if (cf.length) {
                  conflicts.push({ opId: op.id, rugId: rug.id, conflicts: cf });
                  // 能自动合并的字段先落地
                  if (Object.keys(patch).length) {
                    const draft = structuredCloneSafe(rug);
                    applyOp(draft, { ...op, patch }, state.cards);
                    for (const k of Object.keys(patch)) draft.fieldRev[k] = draft.rev;
                    Object.assign(rug, draft);
                    store.rememberOp(op.id + "-autopart");
                    recordEvent(state, { ...op, type: "updateRug(auto)" });
                  }
                  results.push({ kind: "op", opId: op.id, partial: true });
                  continue;
                }
                op.patch = patch;
              }

              if (op.type === "rephoto") {
                op.outsideCount = countOutsideAfter(state, op);
              }
              const draft = structuredCloneSafe(rug);
              applyOp(draft, op, state.cards);
              if (op.type === "updateRug") {
                for (const k of Object.keys(op.patch || {})) {
                  if (META_KEYS.has(k)) draft.fieldRev[k] = draft.rev;
                }
              }
              Object.assign(rug, draft);
              store.rememberOp(op.id);
              recordEvent(state, op);
              results.push({ kind: "op", opId: op.id, ok: true, rugRev: rug.rev });
            } catch (e) {
              results.push({
                kind: "op",
                opId: op.id,
                error: e.code || "ERROR",
                message: e.message,
              });
            }
          }

          await store.persist();
          const state2 = snapshot(state);
          send(res, 200, {
            ok: true,
            results,
            conflicts,
            // 客户端用于追平的增量事件与完整档案
            rugs: state2.rugs,
            cards: state2.cards,
            serverTime: new Date().toISOString(),
          });
        })
        .catch((e) => fail(res, e));
    }

    if (p === "/api/events" && req.method === "GET") {
      const since = Number(url.searchParams.get("since") || 0);
      return store.mutate(async (state) =>
        send(res, 200, { events: state.events.slice(since), total: state.events.length })
      );
    }

    if (p === "/api/reset" && req.method === "POST") {
      // 仅演示/测试用
      state_reset();
      async function state_reset() {
        await store.mutate(async (state) => {
          const fresh = seedState();
          state.rugs = fresh.rugs;
          state.cards = fresh.cards;
          state.events = [];
          state.appliedOpIds = [];
          store._seen = new Set();
          await store.persist();
          send(res, 200, { ok: true });
        });
      }
      return;
    }

    return send(res, 404, { error: "NOT_FOUND" });
  } catch (e) {
    return fail(res, e);
  }
});

function countOutsideAfter(state, op) {
  const reg = op.registration;
  const rug = state.rugs.find((r) => r.id === op.rugId);
  if (!rug || !reg) return 0;
  let n = 0;
  for (const m of Object.values(rug.markers)) {
    if (classifyAgainstPhoto(reg, m.rect) === "outside") n += 1;
  }
  return n;
}

function snapshot(state) {
  return {
    rugs: state.rugs,
    cards: state.cards,
    eventCount: state.events.length,
    serverTime: new Date().toISOString(),
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
async function serveStatic(res, p) {
  const rel = p === "/" ? "/index.html" : p;
  const file = path.join(DIST_DIR, rel);
  if (!file.startsWith(DIST_DIR)) return send(res, 403, { error: "FORBIDDEN" });
  const data = await fs.readFile(file).catch(() => null);
  if (!data) {
    // SPA 回退
    const idx = await fs.readFile(path.join(DIST_DIR, "index.html")).catch(() => null);
    if (idx) return res.writeHead(200, { "content-type": MIME[".html"] }), res.end(idx);
    return send(res, 404, { error: "NOT_FOUND" });
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(data);
}

async function main() {
  const state = await store.load(seedState);
  // 确保演示照片存在
  for (const [file, rugId, variant] of [
    ["rug1-v1.svg", "rug-092", "v1"],
    ["rug2-v1.svg", "rug-117", "v1"],
    ["rug3-v1.svg", "rug-138", "v1"],
    ["rug1-v2.svg", "rug-092", "v2"],
  ]) {
    const fp = path.join(store.photoDir, file);
    const exists = await fs.access(fp).then(() => true, () => false);
    if (!exists) await fs.writeFile(fp, rugSvg(rugId, variant));
  }
  void state;
  server.listen(PORT, () => {
    const actual = server.address().port;
    console.log(`修复台服务器: http://localhost:${actual}  数据目录 ${DATA_DIR}  LISTEN ${actual}`);
  });
}
main();
