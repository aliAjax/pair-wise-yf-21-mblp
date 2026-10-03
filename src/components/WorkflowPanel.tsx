import { useState } from "react";
import type { RugView } from "../../shared/domain";
import { STAGE_LABEL } from "../../shared/domain.js";
import { useStore } from "../store/store";

export function WorkflowPanel({ rug }: { rug: RugView }) {
  const store = useStore();
  const master = store.session.role === "master";
  const [busy, setBusy] = useState(false);

  const send = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      store.dispatch({ rugId: rug.id, ...patch } as never);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const order = ["mend", "weave", "flatten"] as const;
  const idx = rug.done ? 3 : order.indexOf(rug.stage as (typeof order)[number]);

  return (
    <div className="panel">
      <h3>修复工序</h3>
      <div className="steps">
        {order.map((s, i) => (
          <div key={s} className={`step ${i < idx ? "done" : i === idx ? "current" : ""}`}>
            {STAGE_LABEL[s]}
          </div>
        ))}
        <div className={`step ${rug.done ? "done" : ""}`}>完工</div>
      </div>

      <div className="toolbar">
        {!rug.done && (
          <>
            <button
              className={`btn ${rug.stage === "mend" ? "primary" : ""}`}
              disabled={busy || !master}
              onClick={() => void send({ type: "setThreadIssued", issued: !rug.threadIssued })}
              title={master ? "" : "仅师傅可登记领线"}
            >
              {rug.threadIssued ? "✓ 已领线（撤销）" : "登记领线"}
            </button>
            <button
              className="btn teal primary"
              disabled={busy || !master || !rug.canAdvance}
              onClick={() => void send({ type: "advance" })}
              title={
                !master
                  ? "仅师傅可推进"
                  : rug.stage === "mend" && !rug.threadIssued
                    ? "还没有领线，不能进入编织"
                    : ""
              }
            >
              推进到 {STAGE_LABEL[order[Math.min(idx + 1, 2)] as keyof typeof STAGE_LABEL]}
            </button>
            <button
              className="btn primary"
              disabled={busy || !master || !rug.canComplete}
              onClick={() => {
                if (confirm("完工确认后将冻结当时的色卡批次，之后色卡换批不影响本毯。确认完工？")) {
                  void send({ type: "complete" });
                }
              }}
              title={master ? "" : "完工必须师傅确认"}
            >
              师傅确认完工
            </button>
          </>
        )}
        {rug.done && (
          <button className="btn" disabled={!master} onClick={() => void send({ type: "reopen" })}>
            恢复为进行中
          </button>
        )}
      </div>

      {rug.stage === "mend" && !rug.threadIssued && !rug.done && (
        <p className="hint" style={{ marginTop: 8, color: "var(--danger)" }}>
          未登记领线：即使尝试推进，编织也会退回补线。
        </p>
      )}
      {rug.threadIssued && !rug.done && (
        <p className="hint" style={{ marginTop: 8 }}>
          领线撤销（没领到线）时，处于编织的工序自动退回上一步「补线」。
        </p>
      )}
      {rug.done && (
        <div className="frozen-note">
          已于 {new Date(rug.completedAt!).toLocaleString("zh-CN")} 由 {rug.completedBy} 完工确认；
          补线配色冻结当时批次，色卡后续换批不影响本毯。
        </div>
      )}
      {!master && <p className="hint" style={{ marginTop: 8 }}>学徒身份只能添加破损标记，工序操作请切换师傅。</p>}
    </div>
  );
}
