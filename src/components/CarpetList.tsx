import { useStore } from "../store";
import { WORK_STAGES } from "../pattern";
import type { Stage } from "../types";

const ORIGINS = ["全部", "波斯", "安纳托利亚", "高加索", "藏毯"];

function stageClass(stage: Stage): string {
  if (stage === "完工") return "st-done";
  return `st-${WORK_STAGES.indexOf(stage as (typeof WORK_STAGES)[number])}`;
}

export default function CarpetList() {
  const { carpets, filter, setFilter, selectedId, setSelectedId, outbox } = useStore();

  const shown = carpets.filter((c) => (filter === "全部" ? true : c.origin === filter));

  return (
    <aside className="panel sidebar">
      <div className="heading">
        <div>
          <p>按产地筛选</p>
          <h2>纹样档案</h2>
        </div>
      </div>
      <div className="chips">
        {ORIGINS.map((o) => (
          <button
            key={o}
            className={o === filter ? "active" : ""}
            onClick={() => setFilter(o)}
          >
            {o}
          </button>
        ))}
      </div>

      <div className="carpet-list">
        {shown.map((c) => {
          const pending = outbox.filter((o) => o.carpetId === c.id).length;
          return (
            <button
              key={c.id}
              className={`carpet-card ${c.id === selectedId ? "selected" : ""}`}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="carpet-card-top">
                <b>{c.code}</b>
                <span className={`stage-badge ${stageClass(c.stage)}`}>
                  {c.stage === "完工" ? "✓ 已完工" : c.stage}
                </span>
              </div>
              <div className="carpet-card-meta">
                <span>{c.origin}</span>
                <span>{c.material}</span>
                <span>{c.marks.length} 处破损</span>
              </div>
              <div className="carpet-card-flags">
                {c.colorStale && <em className="flag flag-stale">配色作废待重算</em>}
                {c.completedSnapshot && <em className="flag flag-archived">色卡已归档</em>}
                {pending > 0 && <em className="flag flag-pending">离线待同步 {pending}</em>}
              </div>
            </button>
          );
        })}
        {shown.length === 0 && <p className="empty">该产地暂无档案</p>}
      </div>
    </aside>
  );
}
