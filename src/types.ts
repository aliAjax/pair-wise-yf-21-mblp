export type Role = "master" | "apprentice";
export type Stage = "补线" | "编织" | "平整" | "完工";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface Swatch {
  id: string;
  name: string;
  hex: string;
}

export interface ColorBatch {
  id: string;
  name: string;
  activatedAt: number;
  swatches: Swatch[];
}

/** 破损框：按图案坐标记录（归一化 0..1，中心点 + 尺寸） */
export interface Mark {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
  createdBy: string;
  createdAt: number;
}

export interface StageRecord {
  stage: Stage;
  operatorId: string;
  enteredAt: number;
  threadIssued: boolean;
  rolledBack?: boolean;
  issuedBatchId?: string;
  issuedSwatchIds?: string[];
  issuedAt?: number;
}

export interface CompletedSnapshot {
  batchId: string;
  batchName: string;
  matches: Record<string, string>;
  completedAt: number;
  completedBy: string;
}

export interface Carpet {
  id: string;
  code: string;
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
  /** 需配目标色（由染色类型带出） */
  targetColor: string;
  photoSeed: number;
  /** 登记比例：新图相对登记原图的缩放，标记按此迁移 */
  photoScale: number;
  marks: Mark[];
  stage: Stage;
  stageHistory: StageRecord[];
  /** 在工序当前引用的色卡批次 */
  colorBatchId: string;
  /** 每个破损框匹配的色卡 swatchId */
  colorMatches: Record<string, string>;
  /** 色卡批次变更后，进行中配色作废重算 */
  colorStale: boolean;
  /** 完工毯子保留完工当时的色卡快照 */
  completedSnapshot?: CompletedSnapshot;
  version: number;
  updatedAt: number;
  updatedBy: string;
}

export type OpType =
  | "ADD_MARK"
  | "UPDATE_MARK_NOTE"
  | "REPHOTO"
  | "ISSUE_THREAD"
  | "ADVANCE_STAGE"
  | "COMPLETE"
  | "RECOMPUTE_COLORS"
  | "ACTIVATE_BATCH"
  | "ADD_BATCH";

export interface Op {
  id: string;
  type: OpType;
  carpetId?: string;
  payload: Record<string, unknown>;
  /** 操作所基于的服务端版本（毯子版本或色卡批次版本） */
  baseVersion: number;
  createdAt: number;
  by: string;
}

export interface OutboxOp extends Op {
  status: "pending" | "committed" | "skipped";
  result?: string;
}

export interface ConflictState {
  op: Op;
  serverVersion: number;
  serverUpdatedBy: string;
  serverUpdatedAt: number;
  summary: string[];
}

export interface SyncReport {
  merged: string[];
  skipped: string[];
}

export interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
}
