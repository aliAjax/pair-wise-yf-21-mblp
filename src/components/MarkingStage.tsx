import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { carpetPatternDataUri, markPhotoRect, fmtTime } from "../pattern";
import type { Carpet } from "../types";

export default function MarkingStage({ carpet }: { carpet: Carpet }) {
  const { currentUser, rephoto, addMark, updateMarkNote, simulateConcurrentSave } = useStore();
  const isMaster = currentUser.role === "master";

  const [scale, setScale] = useState(carpet.photoScale);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setScale(carpet.photoScale);
  }, [carpet.photoScale, carpet.id]);

  const photoScale = carpet.photoScale;
  const rects = carpet.marks.map((m) => ({ mark: m, ...markPhotoRect(m, photoScale) }));
  const inFrame = rects.filter((r) => r.inFrame);
  const outFrame = rects.filter((r) => !r.inFrame);

  const toPattern = (clientX: number, clientY: number) => {
    const el = stageRef.current!;
    const r = el.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width;
    const fy = (clientY - r.top) / r.height;
    return {
      px: Math.min(1, Math.max(0, 0.5 + (fx - 0.5) / photoScale)),
      py: Math.min(1, Math.max(0, 0.5 + (fy - 0.5) / photoScale)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { px, py } = toPattern(e.clientX, e.clientY);
    drawRef.current = { sx: px, sy: py, px, py };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drawRef.current;
    if (!d) return;
    const { px, py } = toPattern(e.clientX, e.clientY);
    const x = Math.min(d.sx, px);
    const y = Math.min(d.sy, py);
    setDraft({ x, y, w: Math.abs(px - d.sx), h: Math.abs(py - d.sy) });
  };

  const endDraw = () => {
    const d = drawRef.current;
    drawRef.current = null;
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      addMark(carpet.id, {
        x: draft.x + draft.w / 2,
        y: draft.y + draft.h / 2,
        w: draft.w,
        h: draft.h,
        note: `破损 ${carpet.marks.length + 1}`,
      });
    }
    setDraft(null);
  };

  return (
    <section className="panel sub-panel">
      <div className="heading">
        <div>
          <p>纹样局部标记图</p>
          <h3>破损框（图案坐标）</h3>
        </div>
        <button className="mini-btn" onClick={() => simulateConcurrentSave(carpet.id)}>
          模拟另一台平板保存
        </button>
      </div>

      <div
        className="mark-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDraw}
        title="按住拖动可添加破损框（学徒也可标注）"
      >
        <img
          src={carpetPatternDataUri(carpet.photoSeed)}
          alt={`${carpet.code} 纹样图`}
          className="pattern-img"
          style={{ ["--photo-scale" as string]: photoScale } as React.CSSProperties}
          draggable={false}
        />
        {inFrame.map(({ mark, cx, cy, w, h }) => (
          <div
            key={mark.id}
            className="mark-box"
            style={{
              left: `${(cx - w / 2) * 100}%`,
              top: `${(cy - h / 2) * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
            }}
          >
            <span>{mark.note}</span>
          </div>
        ))}
        {draft && (
          <div
            className="mark-box draft"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
          />
        )}
        <div className="mark-hint">
          登记比例 {photoScale.toFixed(2)} · 标记按图案坐标记录，重拍后按比例迁移
        </div>
      </div>

      <div className="rephoto-row">
        <label className="scale-label">
          <span>重新拍照 · 登记比例</span>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={scale}
            disabled={!isMaster}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          />
          <span className="scale-value">{scale.toFixed(2)}×</span>
        </label>
        <button
          className="primary"
          disabled={!isMaster}
          onClick={() => rephoto(carpet.id, scale)}
          title={isMaster ? "按登记比例迁移标记" : "重新拍照需师傅操作"}
        >
          重新拍照并迁移标记
        </button>
      </div>
      {!isMaster && <p className="role-note">学徒可在图上拖动添加破损框；重新拍照由师傅操作。</p>}

      <div className="mark-lists">
        <div className="mark-list">
          <h4>新图内标记（{inFrame.length}）</h4>
          {inFrame.length === 0 && <p className="empty">当前新图内无标记</p>}
          {inFrame.map(({ mark }) => (
            <MarkRow key={mark.id} carpet={carpet} mark={mark} onNote={updateMarkNote} />
          ))}
        </div>
        <div className="mark-list out-frame">
          <h4>落在新图外的标记（{outFrame.length} · 单列）</h4>
          <p className="list-note">图案坐标仍保留，比例迁回后会重新出现在新图中。</p>
          {outFrame.length === 0 && <p className="empty">无</p>}
          {outFrame.map(({ mark }) => (
            <MarkRow key={mark.id} carpet={carpet} mark={mark} onNote={updateMarkNote} outFrame />
          ))}
        </div>
      </div>
    </section>
  );
}

function MarkRow({
  carpet,
  mark,
  onNote,
  outFrame,
}: {
  carpet: Carpet;
  mark: Carpet["marks"][number];
  onNote: (carpetId: string, markId: string, note: string, fromNote: string) => void;
  outFrame?: boolean;
}) {
  const { batches, activeBatch } = useStore();
  const batch = batches.find((b) => b.id === (carpet.completedSnapshot?.batchId ?? carpet.colorBatchId));
  const swatch = batch?.swatches.find((s) => s.id === carpet.colorMatches[mark.id]);
  return (
    <div className={`mark-row ${outFrame ? "out" : ""}`}>
      <span className="mark-swatch" style={{ background: swatch?.hex ?? "#ccc" }} title={swatch?.name} />
      <input
        className="mark-note"
        value={mark.note}
        onChange={(e) => onNote(carpet.id, mark.id, e.target.value, mark.note)}
      />
      <span className="mark-coord">
        ({mark.x.toFixed(2)}, {mark.y.toFixed(2)})
      </span>
      <span className="mark-who">
        {mark.createdBy === "u1" ? "王师傅" : mark.createdBy === "u2" ? "小李" : "离线合并"} ·{" "}
        {fmtTime(mark.createdAt)}
      </span>
    </div>
  );
}
