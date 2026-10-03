import { useState } from "react";
import { useStore } from "../store/store";

const OP_LABEL: Record<string, string> = {
  addMarker: "新增标记",
  updateMarker: "修改标记",
  removeMarker: "删除标记",
  rephoto: "重拍登记",
  updateRug: "保存档案",
  assignMaterial: "指定材料",
  setThreadIssued: "领线登记",
  advance: "推进工序",
  complete: "完工确认",
  reopen: "恢复进行中",
};

export function SyncDock() {
  const store = useStore();
  const [open, setOpen] = useState(true);
  const q = store.queue;
  if (!q.length) return null;
  const errors = q.filter((x) => x.error);

  return (
    <div className="queue-panel">
      <header onClick={() => setOpen((v) => !v)} style={{ cursor: "pointer" }}>
        <span>
          {store.online ? "同步队列" : "离线暂存"} · {q.length} 项{errors.length ? ` · ${errors.length} 项待处理` : ""}
        </span>
        <span>{open ? "▾" : "▸"}</span>
      </header>
      {open && (
        <div className="body">
          <p className="hint" style={{ margin: "0 0 6px" }}>
            {store.online
              ? "正在与服务器合并；事实操作追加保留，覆盖操作遇先到保存会请你选边。"
              : "标注已保存在这台平板上；恢复网络后自动与服务器合并，重复内容按编号幂等去重。"}
          </p>
          {q.map((item) => (
            <div key={item.key} className={`queue-item ${item.error ? "err" : ""}`}>
              {item.kind === "card"
                ? `色卡发布：${item.card?.material} ${item.card?.code || ""}（批次 #${item.card?.batchId}）`
                : `${OP_LABEL[item.op?.type || ""] || item.op?.type} @ ${item.op?.rugId}`}
              <div className="muted" style={{ fontSize: 11 }}>
                {new Date(item.savedAt).toLocaleString("zh-CN")}
                {item.error ? ` · ${item.error}` : store.busy ? " · 同步中…" : " · 待同步"}
              </div>
              {item.error && (
                <div className="actions">
                  <button onClick={() => store.retryItem(item.key)}>重试</button>
                  <button onClick={() => void store.discardItem(item.key)}>放弃（采用服务器版本）</button>
                </div>
              )}
            </div>
          ))}
          <div className="actions" style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button className="btn small primary" onClick={() => void store.flush()} disabled={store.busy || !store.online}>
              立即同步
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConflictBanner() {
  const store = useStore();
  const cs = store.conflicts;
  if (!cs.length) return null;
  const byRug = new Map<string, typeof cs>();
  for (const c of cs) {
    const arr = byRug.get(c.rugId) || [];
    arr.push(c);
    byRug.set(c.rugId, arr);
  }
  return (
    <div className="conflict-banner">
      <b>合并冲突：另一班次先保存了同一处</b>
      <p className="hint" style={{ margin: "4px 0" }}>
        后到的保存不会覆盖先到的。不冲突的字段已自动合并，请为下面每处选择保留哪个版本：
      </p>
      {[...byRug.entries()].map(([rugId, rows]) => {
        const rug = store.rugs.find((r) => r.id === rugId);
        return (
          <div key={rugId}>
            <h4 style={{ margin: "6px 0 2px" }}>
              {rug?.code} {rug?.name}
            </h4>
            {rows.map((c) =>
              c.field === "__coord__" ? (
                <div className="conflict-row" key={c.opId + c.field}>
                  <span>{c.label}：</span>
                  <span style={{ flex: 1 }}>{c.serverValue}已保留；你的离线改动无法自动叠加，已在图上拉取最新版本，请在最新照片上重做。</span>
                  <button className="btn small" onClick={() => void store.discardItem(c.opId)}>
                    知道了
                  </button>
                </div>
              ) : (
                <div className="conflict-row" key={c.opId + c.field}>
                  <span>{c.label}：</span>
                  <div className="vals">
                    <button className="local" onClick={() => void store.resolveConflict(rugId, c.field, "local")}>
                      保留我的离线值<br />
                      <b className="muted">{c.localValue || "（空）"}</b>
                    </button>
                    <button className="server" onClick={() => void store.resolveConflict(rugId, c.field, "server")}>
                      采用先到的值<br />
                      <b className="muted">{c.serverValue || "（空）"}</b>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
