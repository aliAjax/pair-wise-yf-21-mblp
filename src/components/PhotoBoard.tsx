/**
 * 纹样标记图板。
 * - 标记框用图案坐标存，渲染时按当前登记映射回照片百分比；
 * - 框选新破损：鼠标/触摸拖出照片坐标框，松手时换算成图案坐标；
 * - 重拍登记模式下显示两枚可拖动锚点（新照片黄点 ↔ 纹样蓝点）。
 */
import React, { useEffect, useRef, useState } from "react";
import type { Registration, Rect, RugView } from "../../shared/domain";
import { photoToPattern, rectPatternToPhoto, registrationFromAnchors } from "../../shared/domain.js";

interface BoardProps {
  rug: RugView;
  photoUrl: string;
  canAdd: boolean;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (rect: Rect) => void;
}

export function PhotoBoard({ rug, photoUrl, canAdd, selectedId, onSelect, onAdd }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const start = useRef<{ px: number; py: number } | null>(null);
  const reg = rug.registration;

  function pos(e: React.PointerEvent): { px: number; py: number } {
    const box = ref.current!.getBoundingClientRect();
    return {
      px: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      py: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  function onDown(e: React.PointerEvent) {
    if (!canAdd || !reg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = pos(e);
    setDraft({ x: start.current.px, y: start.current.py, w: 0, h: 0 });
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    const p = pos(e);
    const x = Math.min(start.current.px, p.px);
    const y = Math.min(start.current.py, p.py);
    setDraft({ x, y, w: Math.abs(p.px - start.current.px), h: Math.abs(p.py - start.current.py) });
  }
  function onUp() {
    if (start.current && draft && reg && draft.w > 0.01 && draft.h > 0.01) {
      // 照片框 → 图案框
      const a = photoToPattern(reg, draft.x, draft.y);
      const b = photoToPattern(reg, draft.x + draft.w, draft.y + draft.h);
      onAdd({
        x: Math.min(a.qx, b.qx),
        y: Math.min(a.qy, b.qy),
        w: Math.abs(b.qx - a.qx),
        h: Math.abs(b.qy - a.qy),
      });
    }
    start.current = null;
    setDraft(null);
  }

  return (
    <div
      ref={ref}
      className="board"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("overlay")) onDown(e);
      }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{ cursor: canAdd ? "crosshair" : "default" }}
    >
      <img src={photoUrl} alt={rug.name} draggable={false} />
      <div className="overlay">
        {reg &&
          rug.markers
            .filter((m) => m.status !== "outside")
            .map((m) => {
              const r = rectPatternToPhoto(reg, m.rect);
              return (
                <div
                  key={m.id}
                  className={`marker-box ${m.status} ${m.id === selectedId ? "selected" : ""}`}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(m.id);
                  }}
                >
                  <span className="tag">{m.note || m.id.slice(-4)}</span>
                  {m.assignment?.hex && <span className="swatch" style={{ background: m.assignment.hex }} />}
                </div>
              );
            })}
        {draft && (
          <div
            className="draft-box"
            style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 重拍登记向导                                                        */
/* ------------------------------------------------------------------ */

interface AnchorState {
  // 新照片上的两点 p（百分比）
  p1: { px: number; py: number };
  p2: { px: number; py: number };
  // 纹样上的对应两点 q（图案坐标）
  q1: { qx: number; qy: number };
  q2: { qx: number; qy: number };
}

export function RephotoModal({
  rug,
  currentUrl,
  newDataUrl,
  onClose,
  onConfirm,
}: {
  rug: RugView;
  currentUrl: string;
  newDataUrl: string;
  onClose: () => void;
  onConfirm: (reg: Registration, note?: string) => void;
}) {
  const oldReg = rug.registration || { s: 1, ax: 0, ay: 0, qx: 0, qy: 0 };
  const [anchors, setAnchors] = useState<AnchorState>({
    p1: { px: oldReg.ax, py: oldReg.ay },
    p2: { px: Math.min(1, oldReg.ax + 0.7 / oldReg.s), py: Math.min(1, oldReg.ay + 0.4 / oldReg.s) },
    q1: { qx: oldReg.qx, qy: oldReg.qy },
    q2: { qx: Math.min(1, oldReg.qx + 0.7), qy: Math.min(1, oldReg.qy + 0.4) },
  });
  const [manualS, setManualS] = useState<string>("");
  const [err, setErr] = useState("");
  const newRef = useRef<HTMLDivElement>(null);
  const drag = useRef<"p1" | "p2" | null>(null);

  let reg: Registration | null = null;
  try {
    reg = registrationFromAnchors(anchors.p1, anchors.q1, anchors.p2, anchors.q2);
    if (manualS && Number(manualS) > 0) reg = { ...reg, s: Number(manualS) };
  } catch (e) {
    reg = null;
  }

  function onAnchorDown(which: "p1" | "p2") {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = which;
    };
  }
  function onAnchorMove(e: React.PointerEvent) {
    if (!drag.current || !newRef.current) return;
    const box = newRef.current.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const py = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    setAnchors((a) => ({ ...a, [drag.current!]: { px, py } }));
  }
  function nudgeQ(which: "q1" | "q2", dx: number, dy: number) {
    setAnchors((a) => ({
      ...a,
      [which]: {
        qx: Math.min(1, Math.max(0, a[which].qx + dx)),
        qy: Math.min(1, Math.max(0, a[which].qy + dy)),
      },
    }));
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>重拍登记：{rug.code} {rug.name}</h3>
        <p className="step-hint">
          ① 拖黄点把新照片上的两处纹样特征对到旧图蓝点；② 蓝点位置不对可用「微调」修正；
          ③ 登记比例由两点距离自动算出。确认后破损框按图案坐标迁移，新图外的单独列出。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <p className="hint">旧照片（纹样基准）</p>
            <div className="board">
              <img src={currentUrl} alt="旧照片" draggable={false} />
              <div className="overlay">
                {(["q1", "q2"] as const).map((k, i) => (
                  <div key={k}>
                    <div
                      className="anchor pattern"
                      style={{ left: `${anchors[k].qx * 100}%`, top: `${anchors[k].qy * 100}%` }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ position: "absolute", left: 8, bottom: 8 + i * 30, display: "flex", gap: 4, zIndex: 2 }}>
                      {[
                        ["◀", -0.01, 0],
                        ["▶", 0.01, 0],
                        ["▲", 0, -0.01],
                        ["▼", 0, 0.01],
                      ].map(([t, dx, dy]) => (
                        <button
                          key={t as string}
                          type="button"
                          className="btn small"
                          onClick={() => nudgeQ(k, dx as number, dy as number)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="hint">新照片（拖动①②黄点对齐）</p>
            <div
              ref={newRef}
              className="board"
              onPointerMove={onAnchorMove}
              onPointerUp={() => (drag.current = null)}
            >
              <img src={newDataUrl} alt="新照片" draggable={false} />
              <div className="overlay">
                {(["p1", "p2"] as const).map((k, i) => (
                  <div
                    key={k}
                    className="anchor"
                    style={{ left: `${anchors[k].px * 100}%`, top: `${anchors[k].py * 100}%`, touchAction: "none" }}
                    onPointerDown={onAnchorDown(k)}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
          <span className="mono">登记比例 s = {reg ? reg.s.toFixed(4) : "—"}</span>
          <span className="hint">手动覆盖比例（可选）：</span>
          <input
            value={manualS}
            placeholder="例如 0.9"
            onChange={(e) => setManualS(e.target.value)}
            style={{ width: 90, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6 }}
          />
          {reg && <Preview rug={rug} reg={reg} />}
          {err && <span style={{ color: "var(--danger)" }}>{err}</span>}
        </div>
        <div className="toolbar">
          <button
            className="btn primary"
            onClick={() => {
              if (!reg) return setErr("锚点距离过近，无法计算比例");
              onConfirm(reg);
            }}
          >
            确认迁移
          </button>
          <button className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** 预览迁移后落在新图上的标记分布（含图外计数），不修改档案 */
function Preview({ rug, reg }: { rug: RugView; reg: Registration }) {
  let inside = 0;
  let partial = 0;
  let outside = 0;
  for (const m of rug.markers) {
    // 复用 board 同款判定（避免循环 import 困难，这里直接内联）
    const x1 = Math.min(reg.qx - reg.s * reg.ax, reg.qx + reg.s * (1 - reg.ax));
    const y1 = Math.min(reg.qy - reg.s * reg.ay, reg.qy + reg.s * (1 - reg.ay));
    const x2 = Math.max(reg.qx - reg.s * reg.ax, reg.qx + reg.s * (1 - reg.ax));
    const y2 = Math.max(reg.qy - reg.s * reg.ay, reg.qy + reg.s * (1 - reg.ay));
    const r = m.rect;
    if (r.x + r.w < x1 || r.y + r.h < y1 || r.x > x2 || r.y > y2) outside += 1;
    else if (r.x >= x1 && r.y >= y1 && r.x + r.w <= x2 && r.y + r.h <= y2) inside += 1;
    else partial += 1;
  }
  return (
    <span className="hint">
      迁移结果：<b style={{ color: "var(--ok)" }}>{inside} 在图内</b>
      {partial > 0 && <b style={{ color: "var(--warn)" }}>，{partial} 被裁切</b>}
      {outside > 0 && <b style={{ color: "var(--danger)" }}>，{outside} 落到图外（将单独列出）</b>}
    </span>
  );
}
