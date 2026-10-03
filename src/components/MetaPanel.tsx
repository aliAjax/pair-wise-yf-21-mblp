import React, { useEffect, useRef, useState } from "react";
import type { RugDoc } from "../../shared/domain";
import { useStore } from "../store/store";

const FIELDS: { key: keyof RugDoc; label: string; options?: string[] }[] = [
  { key: "name", label: "名称" },
  { key: "code", label: "编号" },
  { key: "origin", label: "产地", options: ["波斯", "安纳托利亚", "高加索", "藏毯", "其他"] },
  { key: "era", label: "年代" },
  { key: "knotDensity", label: "结密度" },
  { key: "material", label: "材质" },
  { key: "dyeType", label: "染色类型", options: ["植物染", "矿物染", "化学染", "混合染"] },
  { key: "note", label: "备注" },
];

export function MetaPanel({ rug }: { rug: RugDoc }) {
  const store = useStore();
  const master = store.session.role === "master";
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const baseRev = useRef(rug.rev);

  useEffect(() => {
    setDraft({});
    setMsg("");
    baseRev.current = rug.rev;
  }, [rug.id]);

  const changed = Object.entries(draft).filter(([k, v]) => v !== (rug as never)[k]);

  const save = () => {
    const patch = Object.fromEntries(changed);
    if (!Object.keys(patch).length) return;
    try {
      store.dispatch({ rugId: rug.id, type: "updateRug", baseRev: baseRev.current, patch } as never);
      setDraft({});
      setMsg("已保存");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="panel">
      <h3>纹样档案 {master ? "" : "（只读：学徒不可改档案信息）"}</h3>
      <div className="meta-grid">
        {FIELDS.map((f) => {
          const value = (draft[f.key] ?? (rug[f.key] as string)) || "";
          return (
            <React.Fragment key={f.key}>
              <label>{f.label}</label>
              {f.options ? (
                <select
                  value={value}
                  disabled={!master || rug.stage === "done"}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : f.key === "note" ? (
                <textarea
                  rows={2}
                  value={value}
                  disabled={!master || rug.stage === "done"}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  value={value}
                  disabled={!master || rug.stage === "done"}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {master && rug.stage !== "done" && (
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!changed.length} onClick={save}>
            保存档案信息
          </button>
          {changed.length > 0 && <span className="hint">改了 {changed.length} 个字段，基于 rev {baseRev.current}</span>}
          {msg && <span className="hint" style={{ color: "var(--ok)" }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
