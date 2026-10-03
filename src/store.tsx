import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Carpet,
  ColorBatch,
  ConflictState,
  Op,
  OpType,
  OutboxOp,
  Role,
  Stage,
  SyncReport,
  Toast,
  User,
} from "./types";
import {
  dyeTargetColor,
  jitterColor,
  latestRecord,
  mulberry32,
  nearestSwatch,
  nextStage,
  prevStage,
  uid,
  WORK_STAGES,
} from "./pattern";

const SERVER_KEY = "repair-desk-server-v1";
const OUTBOX_KEY = "repair-desk-outbox-v1";

const USERS: User[] = [
  { id: "u1", name: "王师傅", role: "master" },
  { id: "u2", name: "小李", role: "apprentice" },
];

// ---------------------------------------------------------------------------
// 种子数据
// ---------------------------------------------------------------------------

function seedBatches(): ColorBatch[] {
  const now = Date.now();
  return [
    {
      id: "b1",
      name: "甲批 · 春染",
      activatedAt: now - 86400000 * 30,
      swatches: [
        { id: "b1-s1", name: "茜草红", hex: "#b03a2e" },
        { id: "b1-s2", name: "靛蓝", hex: "#2f5d8a" },
        { id: "b1-s3", name: "槐黄", hex: "#c9a227" },
        { id: "b1-s4", name: "棕褐", hex: "#6e4a2f" },
        { id: "b1-s5", name: "牙白", hex: "#e9e2d0" },
        { id: "b1-s6", name: "墨黑", hex: "#2a2a2a" },
      ],
    },
    {
      id: "b2",
      name: "乙批 · 秋染",
      activatedAt: now - 86400000 * 2,
      swatches: [
        { id: "b2-s1", name: "枣红", hex: "#9c3a2e" },
        { id: "b2-s2", name: "霁蓝", hex: "#3b6ea5" },
        { id: "b2-s3", name: "藤黄", hex: "#d9a421" },
        { id: "b2-s4", name: "赭石", hex: "#7c5a3a" },
        { id: "b2-s5", name: "月白", hex: "#e7dfcc" },
        { id: "b2-s6", name: "黛黑", hex: "#232323" },
      ],
    },
  ];
}

function makeBatch(): ColorBatch {
  const n = Date.now();
  return {
    id: `b-${n}`,
    name: `丙批 · 冬染`,
    activatedAt: n,
    swatches: [
      { id: `b-${n}-s1`, name: "胭脂", hex: "#b23a48" },
      { id: `b-${n}-s2`, name: "群青", hex: "#2b5fa8" },
      { id: `b-${n}-s3`, name: "鹅黄", hex: "#e0b030" },
      { id: `b-${n}-s4`, name: "酱棕", hex: "#5f3f2b" },
      { id: `b-${n}-s5`, name: "莹白", hex: "#eee6d2" },
      { id: `b-${n}-s6`, name: "玄黑", hex: "#1f1f1f" },
    ],
  };
}

interface CarpetSeed {
  code: string;
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
  stage: Stage;
  markCount: number;
  stale?: boolean;
  completed?: boolean;
}

function seedCarpets(batches: ColorBatch[]): Carpet[] {
  const now = Date.now();
  const rnd = mulberry32(20261003);
  const active = batches[1];
  const old = batches[0];
  const defs: CarpetSeed[] = [
    { code: "CAR-092", origin: "波斯", era: "约1960s", knotDensity: "42 结/寸", material: "羊毛", dyeType: "植物染", stage: "编织", markCount: 3 },
    { code: "CAR-117", origin: "安纳托利亚", era: "约1950s", knotDensity: "38 结/寸", material: "羊毛", dyeType: "植物染", stage: "补线", markCount: 2, stale: true },
    { code: "CAR-138", origin: "藏毯", era: "约1980s", knotDensity: "36 结/寸", material: "羊毛", dyeType: "矿物染", stage: "平整", markCount: 2 },
    { code: "CAR-205", origin: "高加索", era: "约1970s", knotDensity: "40 结/寸", material: "真丝", dyeType: "化学染", stage: "完工", markCount: 3, completed: true },
    { code: "CAR-210", origin: "波斯", era: "约1965s", knotDensity: "44 结/寸", material: "羊毛", dyeType: "化学染", stage: "补线", markCount: 2 },
    { code: "CAR-211", origin: "安纳托利亚", era: "约1955s", knotDensity: "39 结/寸", material: "棉", dyeType: "植物染", stage: "编织", markCount: 3 },
  ];

  return defs.map((def, idx) => {
    const refBatch = def.stale || def.completed ? old : active;
    const targetColor = jitterColor(dyeTargetColor(def.dyeType), rnd);
    const marks = Array.from({ length: def.markCount }, (_, i) => ({
      id: `seed-${def.code}-${i}`,
      x: 0.15 + rnd() * 0.7,
      y: 0.15 + rnd() * 0.7,
      w: 0.08 + rnd() * 0.08,
      h: 0.08 + rnd() * 0.08,
      note: `破损 ${i + 1}`,
      createdBy: "u1",
      createdAt: now - 86400000 * (idx + 1),
    }));
    const colorMatches: Record<string, string> = {};
    for (const m of marks) {
      colorMatches[m.id] = nearestSwatch(targetColor, refBatch.swatches).id;
    }
    const stageHistory = WORK_STAGES.filter(
      (s) => WORK_STAGES.indexOf(s) <= WORK_STAGES.indexOf(def.stage as (typeof WORK_STAGES)[number]),
    ).map((s) => ({
      stage: s,
      operatorId: "u1",
      enteredAt: now - 86400000 * (idx + 1) + WORK_STAGES.indexOf(s) * 3600000,
      threadIssued:
        def.completed || WORK_STAGES.indexOf(s) < WORK_STAGES.indexOf(def.stage as (typeof WORK_STAGES)[number]),
      ...(def.completed
        ? {
            issuedBatchId: refBatch.id,
            issuedSwatchIds: marks.map((m) => colorMatches[m.id]),
            issuedAt: now - 86400000 * (idx + 1) + WORK_STAGES.indexOf(s) * 3600000 + 1800000,
          }
        : {}),
    }));
    if (def.completed) {
      stageHistory.push({
        stage: "完工",
        operatorId: "u1",
        enteredAt: now - 86400000,
        threadIssued: true,
      });
    }
    return {
      id: `car-${idx + 1}`,
      code: def.code,
      origin: def.origin,
      era: def.era,
      knotDensity: def.knotDensity,
      material: def.material,
      dyeType: def.dyeType,
      targetColor,
      photoSeed: 1000 + idx * 137,
      photoScale: 1,
      marks,
      stage: def.stage,
      stageHistory,
      colorBatchId: refBatch.id,
      colorMatches,
      colorStale: !!def.stale,
      completedSnapshot: def.completed
        ? {
            batchId: refBatch.id,
            batchName: refBatch.name,
            matches: { ...colorMatches },
            completedAt: now - 86400000,
            completedBy: "u1",
          }
        : undefined,
      version: 1,
      updatedAt: now - 86400000 * (idx + 1),
      updatedBy: "u1",
    } satisfies Carpet;
  });
}

interface ServerState {
  carpets: Carpet[];
  batches: ColorBatch[];
  activeBatchId: string;
  batchesVersion: number;
}

function seedServer(): ServerState {
  const batches = seedBatches();
  return {
    carpets: seedCarpets(batches),
    batches,
    activeBatchId: batches[1].id,
    batchesVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// 服务端读写（localStorage 模拟）
// ---------------------------------------------------------------------------

function loadServer(): ServerState {
  try {
    const raw = localStorage.getItem(SERVER_KEY);
    if (raw) return JSON.parse(raw) as ServerState;
  } catch {
    /* ignore */
  }
  const seeded = seedServer();
  localStorage.setItem(SERVER_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveServer(s: ServerState) {
  localStorage.setItem(SERVER_KEY, JSON.stringify(s));
}

function loadOutbox(): OutboxOp[] {
  try {
    const raw = sessionStorage.getItem(OUTBOX_KEY);
    if (raw) return JSON.parse(raw) as OutboxOp[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveOutbox(ops: OutboxOp[]) {
  sessionStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
}

// ---------------------------------------------------------------------------
// 纯函数：应用操作到服务端状态
// ---------------------------------------------------------------------------

function isBatchOp(op: { type: OpType }): boolean {
  return op.type === "ACTIVATE_BATCH" || op.type === "ADD_BATCH";
}

function applyCarpetOp(c: Carpet, op: Op, batches: ColorBatch[], activeBatchId: string): Carpet {
  const stamp = { updatedAt: op.createdAt, updatedBy: op.by };
  switch (op.type) {
    case "ADD_MARK": {
      const mark = op.payload.mark as Carpet["marks"][number];
      if (c.marks.some((m) => m.id === mark.id)) return c;
      const batch = batches.find((b) => b.id === activeBatchId)!;
      const sw = nearestSwatch(c.targetColor, batch.swatches);
      return {
        ...c,
        marks: [...c.marks, mark],
        colorMatches: { ...c.colorMatches, [mark.id]: sw.id },
        colorStale: c.colorBatchId !== activeBatchId,
        version: c.version + 1,
        ...stamp,
      };
    }
    case "UPDATE_MARK_NOTE": {
      const { markId, note } = op.payload as { markId: string; note: string };
      return {
        ...c,
        marks: c.marks.map((m) => (m.id === markId ? { ...m, note } : m)),
        version: c.version + 1,
        ...stamp,
      };
    }
    case "REPHOTO":
      return { ...c, photoScale: op.payload.scale as number, version: c.version + 1, ...stamp };
    case "ISSUE_THREAD": {
      const issuedSwatchIds = c.marks.map((m) => c.colorMatches[m.id]).filter(Boolean);
      return {
        ...c,
        stageHistory: c.stageHistory.map((r) =>
          r.stage === c.stage
            ? {
                ...r,
                threadIssued: true,
                issuedBatchId: activeBatchId,
                issuedSwatchIds,
                issuedAt: op.createdAt,
              }
            : r,
        ),
        version: c.version + 1,
        ...stamp,
      };
    }
    case "ADVANCE_STAGE": {
      const rec = latestRecord(c, c.stage);
      if (!rec?.threadIssued) {
        // 没领到线：退回上一步
        const prev = prevStage(c.stage);
        if (!prev) return c;
        return {
          ...c,
          stage: prev,
          stageHistory: [
            ...c.stageHistory,
            { stage: prev, operatorId: op.by, enteredAt: op.createdAt, threadIssued: false, rolledBack: true },
          ],
          version: c.version + 1,
          ...stamp,
        };
      }
      const next = nextStage(c.stage);
      if (!next) return c;
      return {
        ...c,
        stage: next,
        stageHistory: [
          ...c.stageHistory,
          { stage: next, operatorId: op.by, enteredAt: op.createdAt, threadIssued: false },
        ],
        version: c.version + 1,
        ...stamp,
      };
    }
    case "COMPLETE": {
      const batch = batches.find((b) => b.id === activeBatchId)!;
      return {
        ...c,
        stage: "完工",
        completedSnapshot: {
          batchId: batch.id,
          batchName: batch.name,
          matches: { ...c.colorMatches },
          completedAt: op.createdAt,
          completedBy: op.by,
        },
        version: c.version + 1,
        ...stamp,
      };
    }
    case "RECOMPUTE_COLORS": {
      const batch = batches.find((b) => b.id === activeBatchId)!;
      const matches: Record<string, string> = {};
      for (const m of c.marks) {
        matches[m.id] = nearestSwatch(c.targetColor, batch.swatches).id;
      }
      return {
        ...c,
        colorMatches: matches,
        colorStale: false,
        colorBatchId: batch.id,
        version: c.version + 1,
        ...stamp,
      };
    }
    default:
      return c;
  }
}

function applyOp(server: ServerState, op: Op): ServerState {
  if (op.type === "ACTIVATE_BATCH") {
    return {
      ...server,
      activeBatchId: op.payload.batchId as string,
      batchesVersion: server.batchesVersion + 1,
      carpets: server.carpets.map((c) =>
        c.stage === "完工" ? c : { ...c, colorStale: true },
      ),
    };
  }
  if (op.type === "ADD_BATCH") {
    const batch = op.payload.batch as ColorBatch;
    return {
      ...server,
      batches: [...server.batches, batch],
      activeBatchId: batch.id,
      batchesVersion: server.batchesVersion + 1,
      carpets: server.carpets.map((c) =>
        c.stage === "完工" ? c : { ...c, colorStale: true },
      ),
    };
  }
  const idx = server.carpets.findIndex((c) => c.id === op.carpetId);
  if (idx < 0) return server;
  const updated = applyCarpetOp(server.carpets[idx], op, server.batches, server.activeBatchId);
  if (updated === server.carpets[idx]) return server;
  const carpets = server.carpets.slice();
  carpets[idx] = updated;
  return { ...server, carpets };
}

/** 合并语义：离线标注一律追加合并；标量/工序变更在对方已更新时跳过（后到不盖先到） */
function mergeOp(
  server: ServerState,
  op: Op,
): { server: ServerState; applied?: string; skipped?: string } {
  switch (op.type) {
    case "ADD_MARK": {
      const mark = op.payload.mark as Carpet["marks"][number];
      const c = server.carpets.find((x) => x.id === op.carpetId);
      if (!c) return { server, skipped: "毯子不存在" };
      if (c.marks.some((m) => m.id === mark.id)) {
        return { server, skipped: `标记「${mark.note}」已存在` };
      }
      return { server: applyOp(server, op), applied: `追加离线标记「${mark.note}」` };
    }
    case "UPDATE_MARK_NOTE": {
      const c = server.carpets.find((x) => x.id === op.carpetId);
      const { markId, note, fromNote } = op.payload as { markId: string; note: string; fromNote: string };
      const m = c?.marks.find((x) => x.id === markId);
      if (!m) return { server, skipped: "标记不存在" };
      if (m.note !== fromNote) {
        return { server, skipped: `标记「${m.note}」已被对方修改，后到不盖先到` };
      }
      return { server: applyOp(server, op), applied: "更新标记备注" };
    }
    case "REPHOTO": {
      const c = server.carpets.find((x) => x.id === op.carpetId);
      if (c && c.photoScale !== op.payload.fromScale) {
        return { server, skipped: "登记比例已被对方更新，后到不盖先到" };
      }
      return { server: applyOp(server, op), applied: `重新拍照（登记比例 ${op.payload.scale}）` };
    }
    case "ISSUE_THREAD":
    case "ADVANCE_STAGE":
    case "COMPLETE": {
      const c = server.carpets.find((x) => x.id === op.carpetId);
      if (!c) return { server, skipped: "毯子不存在" };
      if (c.stage === "完工") return { server, skipped: "已完工，工序不可再改" };
      const rec = latestRecord(c, c.stage);
      if (op.type === "COMPLETE") {
        if (c.stage !== "平整" || !rec?.threadIssued) {
          return { server, skipped: "不满足完工条件（需平整且领到线）" };
        }
        return { server: applyOp(server, op), applied: "师傅确认完工" };
      }
      if (op.type === "ISSUE_THREAD") {
        if (rec?.threadIssued) return { server, skipped: `${c.stage} 用线已由对方发放` };
        return { server: applyOp(server, op), applied: `发放${c.stage}工序用线` };
      }
      if (rec?.threadIssued && c.stage !== "平整") {
        return { server: applyOp(server, op), applied: `工序推进至 ${nextStage(c.stage)}` };
      }
      return { server, skipped: "工序状态已被对方更新，后到不盖先到" };
    }
    case "RECOMPUTE_COLORS":
      return { server: applyOp(server, op), applied: "按当前色卡作废重算配色" };
    case "ACTIVATE_BATCH":
    case "ADD_BATCH":
      if (server.batchesVersion !== op.baseVersion) {
        return { server, skipped: "色卡批次已被对方更新，后到不盖先到" };
      }
      return {
        server: applyOp(server, op),
        applied: op.type === "ADD_BATCH" ? "新增色卡批次" : "启用色卡批次",
      };
    default:
      return { server };
  }
}

function describeOp(op: Op): string {
  switch (op.type) {
    case "ADD_MARK":
      return `新增破损标记「${(op.payload.mark as { note: string }).note}」`;
    case "UPDATE_MARK_NOTE":
      return `修改标记备注为「${op.payload.note}」`;
    case "REPHOTO":
      return `重新拍照，登记比例改为 ${op.payload.scale}`;
    case "ISSUE_THREAD":
      return `发放工序用线`;
    case "ADVANCE_STAGE":
      return `推进工序`;
    case "COMPLETE":
      return `确认完工`;
    case "RECOMPUTE_COLORS":
      return `色卡作废重算`;
    case "ACTIVATE_BATCH":
      return `启用色卡批次`;
    case "ADD_BATCH":
      return `新增色卡批次`;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface StoreValue {
  users: User[];
  currentUser: User;
  switchUser: (id: string) => void;
  online: boolean;
  setOnline: (v: boolean) => void;
  server: ServerState;
  carpets: Carpet[];
  batches: ColorBatch[];
  activeBatch: ColorBatch;
  outbox: OutboxOp[];
  conflict: ConflictState | null;
  syncReport: SyncReport | null;
  toast: Toast | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  filter: string;
  setFilter: (f: string) => void;
  addMark: (carpetId: string, mark: Omit<Carpet["marks"][number], "id" | "createdAt" | "createdBy">) => void;
  updateMarkNote: (carpetId: string, markId: string, note: string, fromNote: string) => void;
  rephoto: (carpetId: string, scale: number) => void;
  issueThread: (carpetId: string) => void;
  advanceStage: (carpetId: string) => void;
  complete: (carpetId: string) => void;
  recomputeColors: (carpetId: string) => void;
  activateBatch: (batchId: string) => void;
  addBatch: () => void;
  simulateConcurrentSave: (carpetId: string) => void;
  resolveConflict: (choice: "merge" | "discard") => void;
  syncNow: () => void;
  dismissSyncReport: () => void;
  dismissToast: () => void;
  exportCsv: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [users] = useState<User[]>(USERS);
  const [currentUserId, setCurrentUserId] = useState<string>(USERS[0].id);
  const [online, setOnlineState] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [server, setServer] = useState<ServerState>(() => loadServer());
  const [outbox, setOutbox] = useState<OutboxOp[]>(() => loadOutbox());
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedId, setSelectedId] = useState<string>(server.carpets[0]?.id ?? "");
  const [filter, setFilter] = useState<string>("全部");
  const toastTimer = useRef<number | undefined>(undefined);

  const currentUser = users.find((u) => u.id === currentUserId)!;

  const showToast = useCallback((kind: Toast["kind"], text: string) => {
    setToast({ id: Date.now(), kind, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // 离线期间的乐观工作副本
  const working = useMemo<ServerState>(
    () => outbox.reduce((s, op) => applyOp(s, op), server),
    [server, outbox],
  );

  const carpets = working.carpets;
  const batches = working.batches;
  const activeBatch = batches.find((b) => b.id === working.activeBatchId) ?? batches[0];

  // 其他标签页写入时同步服务端状态
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SERVER_KEY) setServer(loadServer());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistOutbox = useCallback((ops: OutboxOp[]) => {
    setOutbox(ops);
    saveOutbox(ops);
  }, []);

  const syncNow = useCallback(() => {
    const ops = loadOutbox();
    if (!ops.length) return;
    let s = loadServer();
    const merged: string[] = [];
    const skipped: string[] = [];
    for (const op of ops) {
      const res = mergeOp(s, op);
      s = res.server;
      if (res.applied) merged.push(res.applied);
      if (res.skipped) skipped.push(res.skipped);
    }
    saveServer(s);
    setServer(s);
    persistOutbox([]);
    setSyncReport({ merged, skipped });
  }, [persistOutbox]);

  // 回到在线状态自动同步
  useEffect(() => {
    if (online && outbox.length) {
      const t = window.setTimeout(syncNow, 300);
      return () => window.clearTimeout(t);
    }
  }, [online, outbox.length, syncNow]);

  const setOnline = useCallback(
    (v: boolean) => {
      setOnlineState(v);
      if (v) showToast("success", "已恢复网络，开始合并离线标注…");
      else showToast("info", "已进入离线模式：标注将保存在本机，联网后合并同步");
    },
    [showToast],
  );

  const requireMaster = useCallback(
    (action: string): boolean => {
      if (currentUser.role !== "master") {
        showToast("error", `学徒只能添加标记；${action}需师傅确认`);
        return false;
      }
      return true;
    },
    [currentUser.role, showToast],
  );

  /** 在线走 CAS 直接提交；离线进 outbox。返回 false 表示发生冲突 */
  const mutate = useCallback(
    (draft: Omit<Op, "id" | "createdAt" | "by" | "baseVersion"> & { carpetId?: string }): boolean => {
      const baseVersion = isBatchOp(draft)
        ? server.batchesVersion
        : server.carpets.find((c) => c.id === draft.carpetId)?.version ?? 0;
      const op: Op = { ...draft, id: uid(), createdAt: Date.now(), by: currentUser.id, baseVersion };
      if (online) {
        const fresh = loadServer();
        const expected = isBatchOp(op)
          ? fresh.batchesVersion
          : fresh.carpets.find((c) => c.id === op.carpetId)?.version;
        if (expected !== baseVersion) {
          const who = fresh.carpets.find((c) => c.id === op.carpetId)?.updatedBy;
          setConflict({
            op,
            serverVersion: expected ?? 0,
            serverUpdatedBy: who ?? "其他技师",
            serverUpdatedAt: fresh.carpets.find((c) => c.id === op.carpetId)?.updatedAt ?? Date.now(),
            summary: [describeOp(op)],
          });
          return false;
        }
        const next = applyOp(fresh, op);
        saveServer(next);
        setServer(next);
      } else {
        const full: OutboxOp = { ...op, status: "pending" };
        persistOutbox([...loadOutbox(), full]);
      }
      return true;
    },
    [online, server, currentUser.id, persistOutbox],
  );

  // ---- 动作 ---------------------------------------------------------------

  const addMark: StoreValue["addMark"] = (carpetId, mark) => {
    const c = carpets.find((x) => x.id === carpetId);
    const ok = mutate({
      type: "ADD_MARK",
      carpetId,
      payload: {
        mark: { ...mark, id: uid(), createdBy: currentUser.id, createdAt: Date.now() },
      },
    });
    if (ok && online && c) showToast("success", `已在 ${c.code} 添加破损标记（图案坐标）`);
  };

  const updateMarkNote: StoreValue["updateMarkNote"] = (carpetId, markId, note, fromNote) => {
    mutate({ type: "UPDATE_MARK_NOTE", carpetId, payload: { markId, note, fromNote } });
  };

  const rephoto: StoreValue["rephoto"] = (carpetId, scale) => {
    if (!requireMaster("重新拍照登记")) return;
    const c = carpets.find((x) => x.id === carpetId);
    const fromScale = c?.photoScale ?? 1;
    const ok = mutate({ type: "REPHOTO", carpetId, payload: { scale, fromScale } });
    if (ok && online && c) {
      const after = markMigration(c, scale);
      showToast(
        "info",
        `标记已按登记比例 ${scale} 迁移：${after.inFrame} 个在新图内，${after.outFrame} 个落在新图外（已单列）`,
      );
    }
  };

  const issueThread: StoreValue["issueThread"] = (carpetId) => {
    if (!requireMaster("发放工序用线")) return;
    const c = carpets.find((x) => x.id === carpetId);
    if (!c) return;
    if (c.colorStale) {
      showToast("error", "色卡批次已变更、配色作废，请先「作废重算」再领线");
      return;
    }
    mutate({ type: "ISSUE_THREAD", carpetId, payload: {} });
  };

  const advanceStage: StoreValue["advanceStage"] = (carpetId) => {
    if (!requireMaster("推进工序")) return;
    const c = carpets.find((x) => x.id === carpetId);
    if (!c) return;
    const rec = latestRecord(c, c.stage);
    if (!rec?.threadIssued) {
      const prev = prevStage(c.stage);
      showToast("info", `本工序未领到线，已退回${prev ?? "上一步"}（${prev ?? c.stage}）`);
    } else if (c.stage === "平整") {
      showToast("info", "平整工序已完成，需师傅确认完工");
      return;
    }
    mutate({ type: "ADVANCE_STAGE", carpetId, payload: {} });
  };

  const complete: StoreValue["complete"] = (carpetId) => {
    if (!requireMaster("完工确认")) return;
    const c = carpets.find((x) => x.id === carpetId);
    if (!c) return;
    const rec = latestRecord(c, c.stage);
    if (c.stage !== "平整" || !rec?.threadIssued) {
      showToast("error", "需在平整工序且领到线后，才能确认完工");
      return;
    }
    mutate({ type: "COMPLETE", carpetId, payload: {} });
  };

  const recomputeColors: StoreValue["recomputeColors"] = (carpetId) => {
    if (!requireMaster("色卡作废重算")) return;
    mutate({ type: "RECOMPUTE_COLORS", carpetId, payload: {} });
  };

  const activateBatch: StoreValue["activateBatch"] = (batchId) => {
    if (!requireMaster("切换色卡批次")) return;
    mutate({ type: "ACTIVATE_BATCH", payload: { batchId } });
  };

  const addBatch: StoreValue["addBatch"] = () => {
    if (!requireMaster("新增色卡批次")) return;
    const batch = makeBatch();
    mutate({ type: "ADD_BATCH", payload: { batch } });
    showToast("info", `${batch.name} 已启用，进行中工序配色全部作废重算`);
  };

  /** 模拟另一台平板（另一位技师）先保存了同一块毯子 */
  const simulateConcurrentSave: StoreValue["simulateConcurrentSave"] = (carpetId) => {
    const fresh = loadServer();
    const c = fresh.carpets.find((x) => x.id === carpetId);
    if (!c) return;
    const bumped: Carpet = {
      ...c,
      version: c.version + 1,
      updatedAt: Date.now(),
      updatedBy: "赵师傅（另一台平板）",
    };
    const next: ServerState = {
      ...fresh,
      carpets: fresh.carpets.map((x) => (x.id === carpetId ? bumped : x)),
    };
    saveServer(next);
    setServer(next);
    showToast(
      "info",
      `赵师傅已在另一台平板保存 ${c.code}（v${c.version} → v${c.version + 1}），你的保存将触发冲突检测`,
    );
  };

  const resolveConflict: StoreValue["resolveConflict"] = (choice) => {
    if (!conflict) return;
    if (choice === "discard") {
      setConflict(null);
      showToast("info", "已放弃本次修改，未覆盖对方保存");
      return;
    }
    const fresh = loadServer();
    const res = mergeOp(fresh, conflict.op);
    const next = res.server;
    saveServer(next);
    setServer(next);
    setConflict(null);
    showToast(
      res.applied ? "success" : "info",
      res.applied
        ? `已合并保存：${res.applied}${res.skipped ? `；跳过 ${res.skipped}` : ""}`
        : `未产生合并项：${res.skipped ?? "对方已更新"}`,
    );
  };

  const dismissSyncReport = useCallback(() => setSyncReport(null), []);

  const exportCsv = useCallback(() => {
    const header = ["编号", "产地", "年代", "结密度", "材质", "染色", "工序", "标记数", "色卡状态"];
    const rows = carpets
      .filter((c) => (filter === "全部" ? true : c.origin === filter))
      .map((c) => [
        c.code,
        c.origin,
        c.era,
        c.knotDensity,
        c.material,
        c.dyeType,
        c.stage,
        String(c.marks.length),
        c.completedSnapshot ? "已完工归档" : c.colorStale ? "配色作废待重算" : "进行中",
      ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "地毯修复纹样档案.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [carpets, filter]);

  const value: StoreValue = {
    users,
    currentUser,
    switchUser: setCurrentUserId,
    online,
    setOnline,
    server,
    carpets,
    batches,
    activeBatch,
    outbox,
    conflict,
    syncReport,
    toast,
    selectedId,
    setSelectedId,
    filter,
    setFilter,
    addMark,
    updateMarkNote,
    rephoto,
    issueThread,
    advanceStage,
    complete,
    recomputeColors,
    activateBatch,
    addBatch,
    simulateConcurrentSave,
    resolveConflict,
    syncNow,
    dismissSyncReport,
    dismissToast,
    exportCsv,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function markMigration(c: Carpet, scale: number): { inFrame: number; outFrame: number } {
  let inFrame = 0;
  let outFrame = 0;
  for (const m of c.marks) {
    const cx = 0.5 + (m.x - 0.5) * scale;
    const cy = 0.5 + (m.y - 0.5) * scale;
    const w = m.w * scale;
    const h = m.h * scale;
    const ok =
      cx - w / 2 >= 0 && cx + w / 2 <= 1 && cy - h / 2 >= 0 && cy + h / 2 <= 1;
    if (ok) inFrame += 1;
    else outFrame += 1;
  }
  return { inFrame, outFrame };
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { WORK_STAGES };
export type { Role };
