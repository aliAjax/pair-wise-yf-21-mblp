import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store/store";
import { STAGE_LABEL } from "../shared/domain.js";
import type { Registration } from "../shared/domain";
import { PhotoBoard, RephotoModal } from "./components/PhotoBoard";
import { WorkflowPanel } from "./components/WorkflowPanel";
import { MarkersPanel } from "./components/MarkersPanel";
import { MetaPanel } from "./components/MetaPanel";
import { ColorCardsPanel, OpLogPanel } from "./components/ColorCardsPanel";
import { SyncDock, ConflictBanner } from "./components/Sync";
import { fileToDataUrl } from "./lib/db";

const ORIGINS = ["全部", "波斯", "安纳托利亚", "高加索", "藏毯", "其他"];

function Sidebar({
  filter,
  setFilter,
  selectedId,
  setSelectedId,
}: {
  filter: string;
  setFilter: (s: string) => void;
  selectedId: string | null;
  setSelectedId: (s: string) => void;
}) {
  const store = useStore();
  const rugs = store.rugs.filter((r) => filter === "全部" || r.origin === filter);
  const [form, setForm] = useState({ code: "", name: "", origin: "波斯", era: "", knotDensity: "", material: "", dyeType: "植物染" });

  return (
    <aside className="sidebar">
      <div className="filters">
        {ORIGINS.map((o) => (
          <button key={o} className={filter === o ? "active" : ""} onClick={() => setFilter(o)}>
            {o}
          </button>
        ))}
      </div>
      <div className="rug-list">
        {rugs.map((r) => {
          const v = store.view(r);
          return (
            <button key={r.id} className={`rug-card ${selectedId === r.id ? "active" : ""}`} onClick={() => setSelectedId(r.id)}>
              <h3>
                {r.code || "未编号"} · {r.name || "未命名"}
              </h3>
              <div className="meta">
                {r.origin} · {r.era || "年代待考"} · {r.knotDensity || "结密度—"}
              </div>
              <div className="badges">
                <span className={`badge stage-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                <span className="badge">{v.markers.length} 处破损</span>
                {v.outsideMarkers.length > 0 && <span className="badge warn">图外 {v.outsideMarkers.length}</span>}
                {v.missingThread && <span className="badge warn">缺色卡</span>}
              </div>
            </button>
          );
        })}
        {rugs.length === 0 && <p className="empty">该产地暂无档案。</p>}
      </div>
      <details className="new-rug">
        <summary>+ 新增修复档案</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const rug = store.createBlank(form);
            setSelectedId(rug.id);
            setForm({ code: "", name: "", origin: "波斯", era: "", knotDensity: "", material: "", dyeType: "植物染" });
          }}
        >
          <input placeholder="编号 CAR-xxx" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
            {ORIGINS.slice(1).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <input placeholder="年代" value={form.era} onChange={(e) => setForm({ ...form, era: e.target.value })} />
          <input placeholder="结密度" value={form.knotDensity} onChange={(e) => setForm({ ...form, knotDensity: e.target.value })} />
          <input placeholder="材质" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
          <select value={form.dyeType} onChange={(e) => setForm({ ...form, dyeType: e.target.value })}>
            {["植物染", "矿物染", "化学染", "混合染"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <button className="btn primary" type="submit">
            建档
          </button>
        </form>
      </details>
    </aside>
  );
}

function Workbench({ rugId }: { rugId: string }) {
  const store = useStore();
  const rugDoc = store.rugs.find((r) => r.id === rugId);
  const [selected, setSelected] = useState<string | null>(null);
  const [rephotoUrl, setRephotoUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = usePhoto(rugDoc?.photo?.url);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  if (!rugDoc) return <div className="empty">档案不存在。</div>;
  const rug = store.view(rugDoc);
  const master = store.session.role === "master";

  const pickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataUrl(file);
    setRephotoUrl(url);
    e.target.value = "";
  };

  const confirmRephoto = (reg: Registration) => {
    try {
      store.dispatch({
        rugId: rug.id,
        type: "rephoto",
        registration: reg,
        prevPhotoId: rug.photo?.id || null,
        photoDataUrl: rephotoUrl!.startsWith("data:") ? rephotoUrl : undefined,
        photoUrl: rephotoUrl!.startsWith("data:") ? undefined : rephotoUrl,
      } as never);
      const v = store.view({ ...rugDoc, registration: reg });
      flash(
        `已按比例 ${reg.s.toFixed(3)} 迁移：图内 ${v.markers.filter((m) => m.status !== "outside").length} 个` +
          (v.outsideMarkers.length ? `，图外 ${v.outsideMarkers.length} 个已单独列出` : "")
      );
      setRephotoUrl(null);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <>
      {toast && <div className="toast ok">{toast}</div>}
      <ConflictBanner />
      <div className="rug-head">
        <div>
          <h2>
            {rug.name || "未命名"} <span className="code">{rug.code}</span>
          </h2>
          <div className="code">
            {rug.origin} · {rug.era || "年代待考"} · {rug.knotDensity || "结密度—"} · {rug.material || "材质—"} · {rug.dyeType}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="toolbar">
          <button className="btn" disabled={!master} onClick={pickFile} title={master ? "重拍后做两点登记，标记按比例迁移" : "仅师傅可重拍登记"}>
            📷 原图重拍 / 登记
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
        </div>
      </div>

      {!rug.registration && (
        <div className="conflict-banner" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
          还没有标记图。请先拍一张毯子照片并做初始登记（第一次可直接以取景全图为基准，比例 1.0）。
          <button className="btn small primary" style={{ marginLeft: 8 }} disabled={!master} onClick={pickFile}>
            拍第一张
          </button>
        </div>
      )}

      <div className="grid">
        <div className="board-wrap">
          {photoUrl && rug.registration ? (
            <PhotoBoard
              rug={rug}
              photoUrl={photoUrl}
              canAdd={true}
              canEdit={master}
              selectedId={selected}
              onSelect={setSelected}
              onAdd={(rect) => {
                try {
                  const id = `mk_${Math.random().toString(36).slice(2, 8)}`;
                  store.dispatch({
                    rugId: rug.id,
                    type: "addMarker",
                    marker: { id, rect, note: "", material: "" },
                  } as never);
                  setSelected(id);
                  flash(store.session.role === "apprentice" ? "学徒已添加标记，待师傅补材料与工序" : "已添加破损框");
                } catch (e) {
                  alert((e as Error).message);
                }
              }}
            />
          ) : (
            <div className="panel empty">暂无照片</div>
          )}
          <div className="hint">
            {rug.registration && (
              <>
                当前登记比例 <span className="mono">s={rug.registration.s.toFixed(4)}</span>，锚点{" "}
                <span className="mono">
                  ({rug.registration.ax.toFixed(2)},{rug.registration.ay.toFixed(2)}) → (
                  {rug.registration.qx.toFixed(2)},{rug.registration.qy.toFixed(2)})
                </span>
                。破损框以图案坐标存储，换图只更新登记，不重画框。
              </>
            )}
          </div>
          <MarkersPanel rug={rug} selectedId={selected} onSelect={setSelected} />
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <WorkflowPanel rug={rug} />
          <ColorCardsPanel rugId={rug.id} />
          <MetaPanel rug={rugDoc} />
          <OpLogPanel rug={rug} />
        </div>
      </div>

      {rephotoUrl && (
        <RephotoModal
          rug={rug}
          currentUrl={photoUrl || rug.photo?.url || ""}
          newDataUrl={rephotoUrl}
          onClose={() => setRephotoUrl(null)}
          onConfirm={confirmRephoto}
        />
      )}
    </>
  );
}

function usePhoto(url: string | null | undefined): string | null {
  const store = useStore();
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void store.resolvePhoto(url).then((u) => alive && setResolved(u));
    return () => {
      alive = false;
    };
  }, [url]);
  return resolved;
}

export default function App() {
  const store = useStore();
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && store.rugs.length) setSelectedId(store.rugs[0].id);
  }, [store.rugs, selectedId]);

  const roleName = useMemo(() => ({ apprentice: "学徒", master: "师傅" }[store.session.role]), [store.session.role]);

  if (!store.ready) return <div className="empty">正在打开修复台…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>地毯纹样修复台</h1>
          <div className="sub">标记按图案坐标 · 重拍按登记比例迁移 · 离线可续作</div>
        </div>
        <div className="spacer" />
        <span className="pill">
          <span className={`dot ${store.online ? "on" : "off"}`} />
          {store.online ? "在线" : "离线"}
        </span>
        <span className="pill syncline" title={store.syncMsg}>
          {store.queue.length ? `${store.queue.length} 项待同步` : store.lastSyncAt ? `上次合并 ${new Date(store.lastSyncAt).toLocaleTimeString("zh-CN")}` : "尚未同步"}
        </span>
        <label className="pill" style={{ gap: 6 }}>
          签名
          <input
            value={store.session.actor}
            onChange={(e) => store.setSession({ ...store.session, actor: e.target.value })}
            style={{ width: 90, background: "transparent", border: "none", color: "#fff", outline: "none", borderBottom: "1px solid rgba(255,255,255,.4)" }}
          />
        </label>
        <div className="role-switch">
          {(["apprentice", "master"] as const).map((r) => (
            <button key={r} className={store.session.role === r ? "active" : ""} onClick={() => store.setSession({ ...store.session, role: r })}>
              {r === "apprentice" ? "学徒" : "师傅"}
            </button>
          ))}
        </div>
      </header>
      <div className="layout">
        <Sidebar filter={filter} setFilter={setFilter} selectedId={selectedId} setSelectedId={setSelectedId} />
        <main className="main">
          {selectedId && <Workbench key={selectedId} rugId={selectedId} />}
          {!selectedId && <div className="empty">请选择或新建一块毯子。当前身份：{roleName}。</div>}
        </main>
      </div>
      <SyncDock />
    </div>
  );
}
