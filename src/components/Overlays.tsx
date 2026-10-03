import { useStore } from "../store";
import { fmtTime } from "../pattern";

export function ConflictDialog() {
  const { conflict, resolveConflict } = useStore();
  if (!conflict) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal conflict-modal">
        <h3>保存冲突：后到的不能盖掉先到的</h3>
        <p className="conflict-lead">
            <b>{conflict.serverUpdatedBy}</b> 已先保存这块毯子（v{conflict.serverVersion - 1} → v
          {conflict.serverVersion}，{fmtTime(conflict.serverUpdatedAt)}）。你的修改基于旧版本，直接保存会覆盖对方工作。
        </p>
        <div className="conflict-body">
          <h4>你本次的修改</h4>
          <ul>
            {conflict.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>合并规则</h4>
          <ul className="merge-rules">
            <li>离线/新增标记：按图案坐标追加合并，不丢失任何一方标注</li>
            <li>备注、登记比例、工序、色卡：对方已更新的不覆盖（先到先得）</li>
          </ul>
        </div>
        <div className="modal-actions">
          <button onClick={() => resolveConflict("discard")}>放弃本次修改</button>
          <button className="primary" onClick={() => resolveConflict("merge")}>
            合并保存（追加标记，保留对方修改）
          </button>
        </div>
      </div>
    </div>
  );
}

export function SyncReportModal() {
  const { syncReport, dismissSyncReport } = useStore();
  if (!syncReport) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>离线标注合并完成</h3>
        <div className="conflict-body">
          <h4>已合并（{syncReport.merged.length}）</h4>
          {syncReport.merged.length === 0 ? (
            <p className="empty">无</p>
          ) : (
            <ul>
              {syncReport.merged.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <h4>已跳过（{syncReport.skipped.length} · 后到不盖先到）</h4>
          {syncReport.skipped.length === 0 ? (
            <p className="empty">无</p>
          ) : (
            <ul>
              {syncReport.skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={dismissSyncReport}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastView() {
  const { toast, dismissToast } = useStore();
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} onClick={dismissToast}>
      {toast.text}
    </div>
  );
}

export function OutboxPanel() {
  const { outbox, online, syncNow, carpets } = useStore();
  if (outbox.length === 0) return null;
  return (
    <div className="outbox-panel">
      <div className="outbox-head">
        <b>离线待同步（{outbox.length}）</b>
        {online ? (
          <button className="primary" onClick={syncNow}>
            立即同步合并
          </button>
        ) : (
          <span className="thread-no">离线中 · 联网后自动合并</span>
        )}
      </div>
      <ul>
        {outbox.map((op) => {
          const code = carpets.find((c) => c.id === op.carpetId)?.code ?? "全局";
          return (
            <li key={op.id}>
              <span className="outbox-code">{code}</span>
              <span>{describeShort(op)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describeShort(op: { type: string; payload: Record<string, unknown> }): string {
  switch (op.type) {
    case "ADD_MARK":
      return `新增标记「${(op.payload.mark as { note: string }).note}」`;
    case "UPDATE_MARK_NOTE":
      return "修改标记备注";
    case "REPHOTO":
      return `重新拍照（比例 ${op.payload.scale}）`;
    case "ISSUE_THREAD":
      return "发放工序用线";
    case "ADVANCE_STAGE":
      return "推进工序";
    case "COMPLETE":
      return "确认完工";
    case "RECOMPUTE_COLORS":
      return "色卡作废重算";
    case "ACTIVATE_BATCH":
      return "启用色卡批次";
    case "ADD_BATCH":
      return "新增色卡批次";
    default:
      return op.type;
  }
}
