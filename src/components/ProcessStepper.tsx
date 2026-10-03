import { useStore } from "../store";
import { WORK_STAGES, latestRecord, fmtTime } from "../pattern";
import type { Carpet, Stage } from "../types";

export default function ProcessStepper({ carpet }: { carpet: Carpet }) {
  const { currentUser, batches, issueThread, advanceStage, complete } = useStore();
  const isMaster = currentUser.role === "master";

  const idx = WORK_STAGES.indexOf(carpet.stage as (typeof WORK_STAGES)[number]);
  const done = carpet.stage === "完工";
  const currentRec = latestRecord(carpet, carpet.stage);
  const threadIssued = !!currentRec?.threadIssued;

  return (
    <section className="panel sub-panel">
      <div className="heading">
        <div>
          <p>修复工序</p>
          <h3>补线 → 编织 → 平整</h3>
        </div>
      </div>

      <div className="stepper">
        {WORK_STAGES.map((s, i) => {
          const rec = latestRecord(carpet, s);
          const state = done || i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <div key={s} className={`step ${state}`}>
              <div className="step-dot">{state === "done" ? "✓" : i + 1}</div>
              <div className="step-body">
                <b>{s}</b>
                {state === "current" && !done && (
                  <span className={threadIssued ? "thread-ok" : "thread-no"}>
                    {threadIssued ? "● 已领到线" : "○ 未领到线"}
                  </span>
                )}
                {state === "done" && rec?.issuedSwatchIds && rec.issuedSwatchIds.length > 0 && (
                  <span className="thread-ok">● 已用线</span>
                )}
                {rec?.rolledBack && <span className="rollback-badge">曾退回</span>}
              </div>
              {i < WORK_STAGES.length - 1 && <div className="step-arrow">→</div>}
            </div>
          );
        })}
        <div className={`step ${done ? "done" : "todo"}`}>
          <div className="step-dot">{done ? "✓" : "⚑"}</div>
          <div className="step-body">
            <b>完工</b>
            {done && <span className="thread-ok">● 已确认</span>}
          </div>
        </div>
      </div>

      {!done && (
        <div className="stage-actions">
          <div className="stage-status">
            当前工序：<b>{carpet.stage}</b>
            {threadIssued ? (
              <span className="thread-ok">（线已领，可推进）</span>
            ) : (
              <span className="thread-no">（未领到线，强行推进将退回上一步）</span>
            )}
          </div>
          <div className="btn-row">
            <button
              disabled={!isMaster}
              onClick={() => issueThread(carpet.id)}
              title={isMaster ? "按当前色卡发放本工序用线" : "学徒只能加标记"}
            >
              发放{carpet.stage}用线
            </button>
            {carpet.stage === "平整" ? (
              <button
                className="primary"
                disabled={!isMaster || !threadIssued}
                onClick={() => complete(carpet.id)}
                title={isMaster ? "师傅确认完工" : "完工需师傅确认"}
              >
                确认完工
              </button>
            ) : (
              <button
                className="primary"
                disabled={!isMaster}
                onClick={() => advanceStage(carpet.id)}
                title={isMaster ? "推进到下一工序；未领到线则退回上一步" : "学徒只能加标记"}
              >
                推进工序
              </button>
            )}
          </div>
          {!isMaster && <p className="role-note">学徒只能添加破损标记；领线、推进与完工由师傅操作。</p>}
        </div>
      )}

      <h4>工序记录</h4>
      <div className="history">
        {carpet.stageHistory.map((r, i) => {
          const batch = r.issuedBatchId ? batches.find((b) => b.id === r.issuedBatchId) : undefined;
          const operator = r.operatorId === "u1" ? "王师傅" : r.operatorId === "u2" ? "小李" : "离线合并";
          return (
            <div key={i} className={`history-row ${r.rolledBack ? "rollback" : ""}`}>
              <span className="history-stage">{r.stage}</span>
              <span className="history-op">{operator}</span>
              <span className="history-time">{fmtTime(r.enteredAt)}</span>
              {r.rolledBack && <span className="history-flag">未领到线，退回上一步</span>}
              {r.threadIssued && !r.rolledBack && (
                <span className="history-thread">
                  已领线{batch ? ` · ${batch.name}` : ""}
                  {r.issuedSwatchIds && r.issuedSwatchIds.length > 0
                    ? ` · ${r.issuedSwatchIds.length} 色`
                    : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
