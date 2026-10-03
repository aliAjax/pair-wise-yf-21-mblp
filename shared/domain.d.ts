/** 共享领域层的松散类型声明（运行时实现为纯 JS，供前端 TS 引用） */

export type Stage = "mend" | "weave" | "flatten" | "done";
export type Role = "apprentice" | "master";
export type MarkerStatus = "inside" | "partial" | "outside";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Registration {
  s: number;
  ax: number;
  ay: number;
  qx: number;
  qy: number;
}
export interface Marker {
  id: string;
  rect: Rect;
  material: string;
  note: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  status: MarkerStatus;
  migration?: { opId: string; at: string; fromPhotoId: string | null };
}
export interface Assignment {
  material: string;
  cardId?: string;
  cardName?: string;
  code?: string;
  hex?: string;
  batchId?: number;
  status: "valid" | "frozen" | "missing";
}
export interface MarkerView extends Marker {
  assignment: Assignment | null;
}
export interface RugDoc {
  id: string;
  code: string;
  name: string;
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
  note: string;
  photo: { id: string; url: string; takenAt: string } | null;
  registration: Registration | null;
  markers: Record<string, Marker>;
  stage: Stage;
  threadIssued: boolean;
  completedAt: string | null;
  completedBy: string | null;
  completionSnapshot: Record<string, Assignment>;
  createdAt: string;
  rev: number;
  fieldRev: Record<string, number>;
  recentOps: { id: string; type: string; at: string; actor: string; role: string; detail: string }[];
}
export interface RugView extends RugDoc {
  markers: MarkerView[];
  outsideMarkers: MarkerView[];
  partialMarkers: MarkerView[];
  stageIndex: number;
  done: boolean;
  missingThread: boolean;
  canAdvance: boolean;
  canComplete: boolean;
  progress: number;
}
export interface ColorCard {
  id: string;
  material: string;
  name: string;
  code: string;
  hex: string;
  batchId: number;
  active?: boolean;
  updatedAt: string;
}
export interface BaseOp {
  id: string;
  rugId: string;
  type: string;
  role: Role | "server";
  actor: string;
  at: string;
  baseRev?: number;
  [k: string]: unknown;
}

export function canPerform(role: string, opType: string): boolean;
export function newId(prefix?: string): string;
export function registrationFromAnchors(
  p1: { px: number; py: number },
  q1: { qx: number; qy: number },
  p2: { px: number; py: number },
  q2: { qx: number; qy: number }
): Registration;
export function photoToPattern(reg: Registration, px: number, py: number): { qx: number; qy: number };
export function patternToPhoto(reg: Registration, qx: number, qy: number): { px: number; py: number };
export function classifyAgainstPhoto(reg: Registration, rect: Rect): MarkerStatus;
export function rectPatternToPhoto(reg: Registration, rect: Rect): Rect;
export function createRug(input: Partial<RugDoc>, meta?: { at?: string }): RugDoc;
export function applyOp(doc: RugDoc, op: BaseOp, cards?: ColorCard[]): RugDoc;
export function deriveRug(doc: RugDoc, cards: ColorCard[]): RugView;
export function markerList(doc: RugDoc): Marker[];
export function cardForMaterial(cards: ColorCard[], material: string): ColorCard | null;
export function snapshotAssignments(doc: RugDoc, cards: ColorCard[]): Record<string, Assignment>;
export function publishCard(
  cards: ColorCard[],
  input: Partial<ColorCard> & { material: string; hex: string; at?: string },
  rugs?: RugDoc[]
): { card: ColorCard; nextCards: ColorCard[]; changed: boolean; reconcile: unknown };
export function mergeMetaPatch(
  entryBaseRev: number,
  patch: Record<string, string>,
  serverDoc: RugDoc
): { patch: Record<string, string>; conflicts: { field: string; localValue: string; serverValue: string }[] };

export class DomainError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string);
}
export const STAGES: Stage[];
export const STAGE_LABEL: Record<Stage, string>;
export const STAGE_ORDER: ("mend" | "weave" | "flatten")[];
export const ROLES: Role[];
export const ROLE_LABEL: Record<Role, string>;
