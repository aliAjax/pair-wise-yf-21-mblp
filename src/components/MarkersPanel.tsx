import { useState } from "react";
import type { MarkerView, RugView } from "../../shared/domain";
import { useStore } from "../store/store";

const STATUS_TEXT: Record<string, string> = {
  inside: "在图内",
  partial: "被边缘裁切",
  outside: "落在新图外",
};

function MarkerRow({
  rug,
  marker,
  selected,
  onSelect,
}: {
  rug: RugView;
  marker: MarkerView;
  selected: boolean;
  onSelect: () => void;
}) {
  const store = useStore();
  const master = store.session.role === "master";
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(marker.note);
  const frozen = !!rug.done;

  return (
    <div className={`marker-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div>
        <div className="line">
          {marker.assignment?.hex ? (
            <span
              className="swatch-dot"
              style={{ background: marker.assignment.hex }}
              title={marker.assignment.code}
            />
          ) : (
            <span className="swatch-dot" style={{ background: "#eee" }} />
          )}
          <b>{marker.note || `破损 ${marker.id.slice(-4)}`}</b>
          <span className={`status-tag status-${marker.status}`}>{STATUS_TEXT[marker.status]}</span>
        </div>
        <div style={{ marginTop: 4 }}>
          {marker.material ? (
            <span className="hint">
              {marker.material}
              {marker.assignment ? (
                marker.assignment.status === "frozen" ? (
                  <>
                    {" "}· {marker.assignment.cardName} <span className="mono">{marker.assignment.code}</span>
                    （批次 #{marker.assignment.batchId} 已冻结）
                  </>
                ) : marker.assignment.status === "valid" ? (
                  <>
                    {" "}· {marker.assignment.cardName} <span className="mono">{marker.assignment.code}</span>
                    （批次 #{marker.assignment.batchId}，随当前色卡）
                  </>
                ) : (
                  <span style={{ color: "var(--danger)" }}> · 色卡缺失，请师傅发布材料色卡</span>
                )
              ) : null}
            </span>
          ) : (
            <span className="muted">未指定补线材料</span>
          )}
        </div>
        {marker.status !== "inside" && marker.migration && (
          <div className="hint" style={{ color: marker.status === "outside" ? "var(--danger)" : "var(--warn)" }}>
            {new Date(marker.migration.at).toLocaleString("zh-CN")} 重拍迁移后{marker.status === "outside" ? "完全在取景外" : "仅部分在取景内"}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {master && !frozen && (
          <select
            value={marker.material}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              store.dispatch({ rugId: rug.id, type: "assignMaterial", markerId: marker.id, material: e.target.value } as never)
            }
            style={{ fontSize: 12, padding: "2px 4px", border: "1px solid var(--line)", borderRadius: 5 }}
          >
            <option value="">未选材料</option>
            {store.cards.map((c) => (
              <option key={c.id} value={c.material}>
                {c.material}（{c.code}）
              </option>
            ))}
          </select>
        )}
        {master && !frozen && (
          <div style={{ marginTop: 4, display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
              }}
            >
              备注
            </button>
            <button
              className="btn small danger"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("删除该破损标记？")) {
                  store.dispatch({ rugId: rug.id, type: "removeMarker", markerId: marker.id } as never);
                }
              }}
            >
              删除
            </button>
          </div>
        )}
        {editing && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              style={{ width: "100%", fontSize: 12, border: "1px solid var(--line)", borderRadius: 5, padding: 4 }}
            />
            <button
              className="btn small primary"
              onClick={() => {
                store.dispatch({ rugId: rug.id, type: "updateMarker", markerId: marker.id, patch: { note } } as never);
                setEditing(false);
              }}
            >
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MarkersPanel({
  rug,
  selectedId,
  onSelect,
}: {
  rug: RugView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const inside = rug.markers.filter((m) => m.status !== "outside");
  const outside = rug.outsideMarkers;
  return (
    <div className="panel">
      <h3>破损标记（{rug.markers.length}）</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        框按图案坐标记录，换照片后按登记比例迁移；颜色从材料色卡带出。
      </p>
      {inside.length === 0 && outside.length === 0 && <p className="muted">还没有标记。</p>}
      {inside.map((m) => (
        <MarkerRow key={m.id} rug={rug} marker={m} selected={m.id === selectedId} onSelect={() => onSelect(m.id)} />
      ))}

      {outside.length > 0 && (
        <>
          <h4 style={{ color: "var(--danger)" }}>新图外的标记（{outside.length}）</h4>
          <p className="hint">这些破损框在当前照片取景之外，已从图上隐藏但仍按图案坐标保留；重新取景包含它们后自动回到图上。</p>
          {outside.map((m) => (
            <MarkerRow key={m.id} rug={rug} marker={m} selected={false} onSelect={() => {}} />
          ))}
        </>
      )}
      {rug.partialMarkers.length > 0 && outside.length === 0 && (
        <p className="hint" style={{ color: "var(--warn)" }}>
          {rug.partialMarkers.length} 个标记被新照片边缘裁切（橙色虚线框）。
        </p>
      )}
    </div>
  );
}
