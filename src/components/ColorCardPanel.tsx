import { useStore } from "../store";
import { fmtTime, nearestSwatch } from "../pattern";
import type { Carpet } from "../types";

export default function ColorCardPanel({ carpet }: { carpet: Carpet }) {
  const {
    batches,
    activeBatch,
    currentUser,
    activateBatch,
    addBatch,
    recomputeColors,
  } = useStore();
  const isMaster = currentUser.role === "master";

  const archived = carpet.completedSnapshot;
  const refBatch = archived
    ? batches.find((b) => b.id === archived.batchId)
    : activeBatch;

  const matchSwatch = (markId: string) => {
    if (archived) {
      return refBatch?.swatches.find((s) => s.id === archived.matches[markId]);
    }
    if (carpet.colorStale) {
      // 作废期间给出按当前批次重算的参考色
      return activeBatch.swatches.find(
        (s) => s.id === nearestSwatch(carpet.targetColor, activeBatch.swatches).id,
      );
    }
    return activeBatch.swatches.find((s) => s.id === carpet.colorMatches[markId]);
  };

  return (
    <section className="panel sub-panel">
      <div className="heading">
        <div>
          <p>材料色卡</p>
          <h3>补线配色</h3>
        </div>
        <button className="mini-btn" disabled={!isMaster} onClick={addBatch}>
          启用新批次
        </button>
      </div>

      {archived ? (
        <div className="archive-banner">
          ✓ 已完工，保留完工当时色卡：<b>{archived.batchName}</b>
          <span>（{fmtTime(archived.completedAt)} 完工，快照不可变）</span>
        </div>
      ) : (
        <>
          <div className="batch-tabs">
            {batches.map((b) => (
              <button
                key={b.id}
                className={b.id === activeBatch.id ? "active" : ""}
                disabled={!isMaster}
                onClick={() => activateBatch(b.id)}
                title={isMaster ? "切换为当前色卡批次" : "切换批次需师傅操作"}
              >
                {b.name}
                {b.id === activeBatch.id && <em className="tag tag-on">进行中引用</em>}
              </button>
            ))}
          </div>

          {carpet.colorStale && (
            <div className="stale-banner">
              <div>
                ⚠ 色卡批次已变更，进行中工序配色作废（原引用{" "}
                {batches.find((b) => b.id === carpet.colorBatchId)?.name ?? "旧批次"}）
              </div>
              <button className="primary" disabled={!isMaster} onClick={() => recomputeColors(carpet.id)}>
                作废重算
              </button>
            </div>
          )}
        </>
      )}

      <div className="target-row">
        <span>需配颜色（{carpet.dyeType}带出）</span>
        <span className="target-swatch" style={{ background: carpet.targetColor }} />
        <span className="target-hex">{carpet.targetColor}</span>
      </div>

      <div className="swatch-grid">
        {(refBatch ?? activeBatch).swatches.map((s) => (
          <div key={s.id} className="swatch" title={`${s.name} ${s.hex}`}>
            <span className="swatch-color" style={{ background: s.hex }} />
            <span className="swatch-name">{s.name}</span>
            <span className="swatch-hex">{s.hex}</span>
          </div>
        ))}
      </div>

      <h4>各破损框配色{carpet.colorStale && !archived ? "（作废重算参考）" : ""}</h4>
      <div className="match-list">
        {carpet.marks.map((m) => {
          const swatch = matchSwatch(m.id);
          return (
            <div key={m.id} className="match-row">
              <span className="mark-swatch" style={{ background: swatch?.hex ?? "#ccc" }} />
              <span className="match-note">{m.note}</span>
              <span className="match-name">{swatch?.name ?? "—"}</span>
              <span className="match-hex">{swatch?.hex ?? ""}</span>
              {carpet.colorStale && !archived && <em className="flag flag-stale">待重算</em>}
            </div>
          );
        })}
        {carpet.marks.length === 0 && <p className="empty">暂无标记，添加破损框后自动配色</p>}
      </div>
    </section>
  );
}
