/**
 * 离线优先的修复台状态层。
 *
 * 所有操作先在本地按 shared/domain.js 同样的规则落地（乐观 UI），
 * 同时进入 IndexedDB 待同步队列：
 *
 * - 网络可用：立即逐条推送。事实类操作（加标记、推进、领线、完工…）不带版本号，
 *   两班技师各自的事实都会保留；
 * - 覆盖类操作（改档案文本、改标记、重拍登记）带 baseRev，命中 409 即「后到不盖先到」：
 *   文本字段做字段级自动合并/弹窗选边；坐标类覆盖提示在最新图上重做；
 * - 离线归来：统一走 /api/sync，服务端按 opId 幂等去重，卡片发布一并补送。
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyOp,
  canPerform,
  createRug,
  deriveRug,
  mergeMetaPatch,
  newId,
  publishCard,
  DomainError,
} from "../../shared/domain.js";
import * as D from "../lib/db";
import type {
  BaseOp,
  ColorCard,
  RugDoc,
  RugView,
} from "../../shared/domain";

interface QueuedItem {
  key: string;
  kind: "op" | "card";
  op?: BaseOp;
  card?: ColorCard;
  savedAt: string;
  error?: string;
}

interface FieldConflict {
  rugId: string;
  field: string;
  label: string;
  localValue: string;
  serverValue: string;
  opId: string;
  /** 已自动合并的字段（无需选择，仅展示） */
  autoMerged?: boolean;
}

interface StoreState {
  ready: boolean;
  online: boolean;
  rugs: RugDoc[];
  cards: ColorCard[];
  queue: QueuedItem[];
  conflicts: FieldConflict[];
  lastSyncAt: string | null;
  syncMsg: string;
  session: { role: "apprentice" | "master"; actor: string };
  busy: boolean;
}

const CACHE_KEY = "state-cache-v1";
const QUEUE_KEY = "queue-v1";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `请求失败 ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

interface StoreCtx extends StoreState {
  setSession: (s: { role: "apprentice" | "master"; actor: string }) => void;
  view: (rug: RugDoc) => RugView;
  dispatch: (op: Omit<BaseOp, "id" | "at" | "role" | "actor"> & Partial<Pick<BaseOp, "role" | "actor">>) => BaseOp;
  resolveConflict: (rugId: string, field: string, pick: "local" | "server") => Promise<void>;
  createBlank: (input: Partial<RugDoc>) => RugDoc;
  publishNewCard: (input: Omit<ColorCard, "id" | "batchId" | "updatedAt">) => Promise<void>;
  retryItem: (key: string) => void;
  discardItem: (key: string) => void;
  flush: () => Promise<void>;
  resolvePhoto: (url: string | null | undefined) => Promise<string | null>;
}

const Ctx = createContext<StoreCtx | null>(null);

const META_LABEL: Record<string, string> = {
  name: "名称",
  code: "编号",
  origin: "产地",
  era: "年代",
  knotDensity: "结密度",
  material: "材质",
  dyeType: "染色类型",
  note: "备注",
};
const CLOBBER_OPS = new Set(["updateRug", "updateMarker", "rephoto"]);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>({
    ready: false,
    online: navigator.onLine,
    rugs: [],
    cards: [],
    queue: [],
    conflicts: [],
    lastSyncAt: null,
    syncMsg: "",
    session: D.loadSession(),
    busy: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const flushing = useRef(false);

  /* ---- 持久化 ---- */
  const persist = async (patch: Partial<StoreState>) => {
    const next = { ...stateRef.current, ...patch };
    await D.idbPut("kv", CACHE_KEY, { rugs: next.rugs, cards: next.cards });
    await D.idbPut("kv", QUEUE_KEY, next.queue);
    setState(next);
  };

  /* ---- 启动：优先服务端，离线读缓存 ---- */
  useEffect(() => {
    (async () => {
      let rugs: RugDoc[] = [];
      let cards: ColorCard[] = [];
      let online = navigator.onLine;
      try {
        const data = await api<{ rugs: RugDoc[]; cards: ColorCard[] }>("/api/state");
        rugs = data.rugs;
        cards = data.cards;
      } catch {
        online = false;
        const cached = await D.idbGet<{ rugs: RugDoc[]; cards: ColorCard[] }>("kv", CACHE_KEY);
        if (cached) {
          rugs = cached.rugs;
          cards = cached.cards;
        }
      }
      const queue = (await D.idbGet<QueuedItem[]>("kv", QUEUE_KEY)) || [];
      await D.idbPut("kv", CACHE_KEY, { rugs, cards });
      setState((s) => ({ ...s, ready: true, online, rugs, cards, queue, lastSyncAt: online ? new Date().toISOString() : null }));
      if (online) setTimeout(() => void flushRef.current(), 300);
    })();

    const on = () => {
      setState((s) => ({ ...s, online: true, syncMsg: "网络已恢复，正在合并离线标注…" }));
      setTimeout(() => void flushRef.current(), 200);
    };
    const off = () => setState((s) => ({ ...s, online: false, syncMsg: "已离线：标注保存在本机，恢复网络后自动合并" }));
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(() => {
      if (navigator.onLine && stateRef.current.queue.length && stateRef.current.queue.every((q) => !q.error)) {
        void flushRef.current();
      }
    }, 15000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 本地派发 ---- */
  const dispatch: StoreCtx["dispatch"] = (raw) => {
    const s = stateRef.current;
    const role = (raw.role as string) || s.session.role;
    const actor = raw.actor || s.session.actor;
    const op = { ...clone(raw), id: newId("op"), at: new Date().toISOString(), role, actor } as BaseOp;
    if (!canPerform(role, op.type)) {
      throw new DomainError("FORBIDDEN", "学徒只能添加破损标记");
    }
    const rug = s.rugs.find((r) => r.id === op.rugId);
    if (!rug) throw new DomainError("NO_RUG", "档案不存在");
    const persistOp = async () => {
      // 重拍：先把照片存进本机 IndexedDB，本地用 photo:<id> 占位地址显示，
      // 同步时携带 dataURL 上传，服务端确认后换成 /photos/<id>。
      if (op.type === "rephoto" && op.photoDataUrl) {
        const photoId = (op.photoId as string) || newId("photo");
        await D.idbPut("photos", photoId, op.photoDataUrl);
        op.photoId = photoId;
        op.photoUrl = `photo:${photoId}`;
      }
      const draft = clone(rug);
      applyOp(draft, op, s.cards); // 本地先校验并落地（领线、工序等规则离线同样生效）
      const rugs = s.rugs.map((r) => (r.id === rug.id ? draft : r));
      // 覆盖类操作登记乐观版本：保存时以当前 rev 为基准，
      // 服务端若已更新则返回 409——后到的不能盖掉先到的；事实类操作无需版本号。
      if (CLOBBER_OPS.has(op.type)) op.baseRev = rug.rev;
      const item: QueuedItem = {
        key: op.id,
        kind: "op",
        op,
        savedAt: new Date().toISOString(),
      };
      await persist({ rugs, queue: [...stateRef.current.queue, item], syncMsg: "" });
      if (navigator.onLine) setTimeout(() => void flushRef.current(), 0);
    };
    // 同步预演（不触碰异步照片存储）：让违反工序/权限的操作在 UI 上立刻报错
    const probe = clone(rug);
    applyOp(probe, { ...op, photoUrl: op.photoUrl || "photo:pending" } as BaseOp, s.cards);
    void persistOp();
    return op;
  };

  const createBlank: StoreCtx["createBlank"] = (input) => {
    const rug = createRug(input);
    void persist({ rugs: [...stateRef.current.rugs, rug] });
    return rug;
  };

  const publishNewCard: StoreCtx["publishNewCard"] = async (input) => {
    const s = stateRef.current;
    if (s.session.role !== "master") throw new DomainError("FORBIDDEN", "只有师傅可以发布色卡");
    const card: ColorCard = { ...input, id: newId("card"), batchId: 1, updatedAt: new Date().toISOString() };
    // 本地立即派生（进行中配色即时跟随；完工毯不受影响）
    const rugsDraft = clone(s.rugs);
    const { nextCards, changed, reconcile } = publishCard(s.cards, { ...card }, rugsDraft);
    void changed;
    void reconcile;
    const item: QueuedItem = { key: card.id, kind: "card", card: nextCards.find((c) => c.material === card.material)!, savedAt: new Date().toISOString() };
    await persist({ cards: nextCards, rugs: rugsDraft, queue: [...s.queue, item] });
    if (navigator.onLine) setTimeout(() => void flushRef.current(), 0);
  };

  /* ---- 同步 ---- */
  const flush = async () => {
    const s = stateRef.current;
    if (flushing.current || !s.queue.length) return;
    flushing.current = true;
    setState((v) => ({ ...v, busy: true }));
    try {
      // 先拉取，避免在过期状态上判断冲突
      const fresh = await api<{ rugs: RugDoc[]; cards: ColorCard[] }>("/api/state");
      const queue = [...s.queue];
      const keep: QueuedItem[] = [];
      const conflicts: FieldConflict[] = [];
      let rugs = fresh.rugs;
      let cards = fresh.cards;

      // 离线期间发布的色卡统一交给 /api/sync
      const pendingCards = queue.filter((q) => q.kind === "card").map((q) => q.card!);
      const pendingOps = queue.filter((q) => q.kind === "op");

      for (const item of pendingOps) {
        const op = clone(item.op!);
        const serverRug = rugs.find((r) => r.id === op.rugId);
        if (!serverRug) {
          keep.push({ ...item, error: "档案在服务端已不存在" });
          continue;
        }
        let opToSend = op;
        if (CLOBBER_OPS.has(op.type) && typeof op.baseRev === "number" && op.baseRev !== serverRug.rev) {
          if (op.type === "updateRug") {
            const { patch, conflicts: cf } = mergeMetaPatch(op.baseRev, op.patch as Record<string, string>, serverRug);
            cf.forEach((c) =>
              conflicts.push({
                rugId: op.rugId,
                field: c.field,
                label: META_LABEL[c.field] || c.field,
                localValue: c.localValue,
                serverValue: c.serverValue,
                opId: op.id,
              })
            );
            if (Object.keys(patch).length) {
              opToSend = { ...op, baseRev: serverRug.rev, patch };
            } else {
              continue; // 全字段冲突，等用户选边
            }
          } else {
            // 坐标类覆盖不能自动合并：保留先到版本，请技师在最新图上重做
            keep.push({ ...item, error: "已有先到的保存覆盖了这处改动，已拉取最新图，请在新图上重做标记" });
            conflicts.push({
              rugId: op.rugId,
              field: "__coord__",
              label: op.type === "rephoto" ? "重拍登记" : "破损框",
              localValue: "我离线时的版本",
              serverValue: "先到的保存",
              opId: op.id,
            });
            continue;
          }
        }
        try {
          const r = await api<{ rug?: RugDoc }>("/api/rugs/ops", opToSend);
          if (r.rug) rugs = rugs.map((x) => (x.id === r.rug!.id ? r.rug! : x));
        } catch (e: any) {
          if (e.code === "REV_CONFLICT") {
            // 极端竞态：刷新后再试一次字段合并
            keep.push({ ...item, error: e.message });
          } else {
            keep.push({ ...item, error: e.message });
          }
        }
      }

      if (pendingCards.length) {
        const sr = await api<{ rugs: RugDoc[]; cards: ColorCard[] }>("/api/sync", {
          cards: pendingCards.map((c) => ({ ...c })),
          ops: [],
        });
        rugs = sr.rugs;
        cards = sr.cards;
      }

      // 用服务端权威状态兜底再取一次
      const finalState = await api<{ rugs: RugDoc[]; cards: ColorCard[] }>("/api/state").catch(() => null);
      if (finalState) {
        rugs = finalState.rugs;
        cards = finalState.cards;
      }

      // 已在服务端落地的本地照片缓存可以清掉
      for (const rug of rugs) {
        if (rug.photo?.id) await D.idbDelete("photos", rug.photo.id).catch(() => {});
      }

      await persist({
        rugs,
        cards,
        queue: keep,
        conflicts: [...stateRef.current.conflicts.filter((c) => !conflicts.some((n) => n.opId === c.opId && n.field === c.field)), ...conflicts],
        lastSyncAt: new Date().toISOString(),
        syncMsg: keep.length ? `${keep.length} 条待处理` : "已与服务器合并",
        online: true,
      });
    } catch {
      // 网络失败：保留队列，等下次在线
      await persist({ online: false, syncMsg: "仍无法连接服务器，标注保留在本机" });
    } finally {
      flushing.current = false;
      setState((v) => ({ ...v, busy: false }));
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const resolveConflict: StoreCtx["resolveConflict"] = async (rugId, field, pick) => {
    const s = stateRef.current;
    const c = s.conflicts.find((x) => x.rugId === rugId && x.field === field);
    if (!c) return;
    if (pick === "local") {
      const rug = s.rugs.find((r) => r.id === rugId)!;
      const op: BaseOp = {
        id: newId("op"),
        type: "updateRug",
        rugId,
        role: "master",
        actor: s.session.actor,
        at: new Date().toISOString(),
        baseRev: rug.rev,
        patch: { [field]: c.localValue },
      };
      await api("/api/rugs/ops", op).catch(async () => {
        // 又被抢先则进队列走合并
        await persist({ queue: [...stateRef.current.queue, { key: op.id, kind: "op", op, savedAt: op.at }] });
      });
    }
    const fresh = await api<{ rugs: RugDoc[] }>("/api/state");
    await persist({
      rugs: fresh.rugs,
      conflicts: s.conflicts.filter((x) => !(x.rugId === rugId && x.field === field)),
    });
    void flushRef.current();
  };

  const setSession: StoreCtx["setSession"] = (session) => {
    D.saveSession(session);
    setState((s) => ({ ...s, session }));
  };

  const retryItem: StoreCtx["retryItem"] = (key) => {
    const q = stateRef.current.queue.map((x) => (x.key === key ? { ...x, error: undefined } : x));
    void persist({ queue: q });
    setTimeout(() => void flushRef.current(), 0);
  };
  const discardItem: StoreCtx["discardItem"] = async (key) => {
    const fresh = await api<{ rugs: RugDoc[]; cards: ColorCard[] }>("/api/state").catch(() => null);
    await persist({
      queue: stateRef.current.queue.filter((x) => x.key !== key),
      ...(fresh ? { rugs: fresh.rugs, cards: fresh.cards } : {}),
    });
  };

  const resolvePhoto: StoreCtx["resolvePhoto"] = async (url) => {
    if (!url) return null;
    if (url.startsWith("photo:")) {
      const id = url.slice(6);
      const cached = await D.idbGet<string>("photos", id);
      return cached || null;
    }
    return url;
  };

  const view = (rug: RugDoc) => deriveRug(rug, stateRef.current.cards);

  const value = useMemo<StoreCtx>(
    () => ({
      ...state,
      view,
      dispatch,
      resolveConflict,
      createBlank,
      publishNewCard,
      retryItem,
      discardItem,
      flush,
      setSession,
      resolvePhoto,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
