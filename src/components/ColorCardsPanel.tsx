import { useState } from "react";
import { useStore } from "../store/store";
import type { ColorCard } from "../../shared/domain";

const OP_LABEL: Record<string, string> = {
  addMarker: "新增标记",
  updateMarker: "修改标记",
  removeMarker: "删除标记",
  rephoto: "重拍登记",
  updateRug: "更新档案",
  assignMaterial: "指定补线材料",
  setThreadIssued: "领线登记",
  advance: "推进工序",
  complete: "完工确认",
  reopen: "恢复进行中",
  reconcileBatches: "配色作废重算",
};

export function ColorCardsPanel({ rugId }: { rugId: string | null }) {
  const store = useStore();
  const master = store.session.role === "master";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ material: "", name: "", code: "", hex: "#1e3a8a" });
  const [err, setErr] = useState("");

  const publish = async (card?: ColorCard) => {
    try {
      if (card) {
        // 修改已有色卡（颜色/编号/名称变了 → 批次 +1，进行中配色作废重算）
        await store.publishNewCard({
          material: card.material,
          name: card.name,
          code: card.code,
          hex: card.hex,
        });
      } else {
        if (!form.material.trim()) throw new Error("材料名称必填");
        await store.publishNewCard(form);
        setForm({ material: "", name: "", code: "", hex: "#1e3a8a" });
        setOpen(false);
      }
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="panel">
      <h3>材料色卡</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        补线颜色从材料色卡带出。改动颜色/编号即换批：进行中毯子的配色立即作废重算，
        已完工毯子保留完工时批次{rugId ? "（可在当前毯子的标记列表核对）" : ""}。
      </p>
      {store.cards.map((c) => (
        <CardEditor key={c.id} card={c} master={master} onSave={() => void publish(c)} />
      ))}
      {master && (
        <>
          {open ? (
            <div className="card-row" style={{ display: "block" }}>
              <input
                placeholder="材料（如：羊毛靛蓝）"
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
                style={{ width: "100%", marginBottom: 4, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
              />
              <input
                placeholder="色卡名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ width: "100%", marginBottom: 4, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} />
                <input
                  placeholder="编号 W-IND"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  style={{ flex: 1, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
                />
                <button className="btn small primary" onClick={() => void publish()}>
                  发布
                </button>
                <button className="btn small" onClick={() => setOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button className="btn small" onClick={() => setOpen(true)}>
              + 新材料色卡
            </button>
          )}
        </>
      )}
      {err && <p style={{ color: "var(--danger)", fontSize: 12 }}>{err}</p>}
    </div>
  );
}

function CardEditor({ card, master, onSave }: { card: ColorCard; master: boolean; onSave: () => void }) {
  const [edit, setEdit] = useState<ColorCard | null>(null);
  const cur = edit || card;
  const dirty = edit && (edit.hex !== card.hex || edit.code !== card.code || edit.name !== card.name);
  return (
    <div className="card-row">
      <input
        type="color"
        value={cur.hex}
        disabled={!master || !edit}
        onChange={(e) => setEdit({ ...cur, hex: e.target.value })}
      />
      <div className="grow">
        <input
          value={cur.name}
          disabled={!master || !edit}
          onChange={(e) => setEdit({ ...cur, name: e.target.value })}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={cur.code}
            disabled={!master || !edit}
            style={{ width: 110, padding: "2px 6px", border: "1px solid var(--line)", borderRadius: 5 }}
            onChange={(e) => setEdit({ ...cur, code: e.target.value })}
          />
          <span className="muted">{card.material}</span>
          <span className="batch">批次 #{card.batchId} · {new Date(card.updatedAt).toLocaleDateString("zh-CN")}</span>
        </div>
      </div>
      {master &&
        (edit ? (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn small primary"
              disabled={!dirty}
              onClick={() => {
                onSave();
                setEdit(null);
              }}
              title={dirty ? "颜色/编号变化将发布新批次并作废重算进行中配色" : "没有变化"}
            >
              发布新批
            </button>
            <button className="btn small" onClick={() => setEdit(null)}>
              取消
            </button>
          </div>
        ) : (
          <button className="btn small" onClick={() => setEdit({ ...card })}>
            改色
          </button>
        ))}
    </div>
  );
}

export function OpLogPanel({ rug }: { rug: import("../../shared/domain").RugView }) {
  const ops = [...rug.recentOps].reverse();
  return (
    <div className="panel">
      <h3>交接记录</h3>
      <ul className="op-log">
        {ops.length === 0 && <li className="muted">暂无操作。</li>}
        {ops.map((o) => (
          <li key={o.id}>
            <time>{new Date(o.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
            <b>{o.actor || "系统"}</b>（{o.role === "master" ? "师傅" : o.role === "apprentice" ? "学徒" : "系统"}）
            {" · "}
            {OP_LABEL[o.type] || o.type}
            {o.detail ? ` — ${o.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
