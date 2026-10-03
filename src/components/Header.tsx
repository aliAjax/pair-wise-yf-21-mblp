import { useStore } from "../store";

export default function Header() {
  const { users, currentUser, switchUser, online, setOnline, carpets, batches } = useStore();

  const total = carpets.length;
  const done = carpets.filter((c) => c.stage === "完工").length;
  const repairing = total - done;
  const rate = total ? Math.round((done / total) * 100) : 0;

  return (
    <header className="hero">
      <div className="hero-top">
        <div>
          <p>hxyfront-62009 · 地毯修复纹样档案 · 修复台</p>
          <h1>纹样修复台</h1>
          <span>
            破损框按图案坐标记录，重拍后按登记比例迁移；补线颜色随材料色卡批次带出，批次变更则在工序配色作废重算；
            工序按补线、编织、平整推进，未领到线退回上一步；学徒可加标记，完工需师傅确认；离线标注联网合并，
            两人同时保存时后到不盖先到。
          </span>
        </div>
        <div className="hero-controls">
          <div className="control-block">
            <small>当班技师</small>
            <div className="seg">
              {users.map((u) => (
                <button
                  key={u.id}
                  className={u.id === currentUser.id ? "active" : ""}
                  onClick={() => switchUser(u.id)}
                >
                  {u.name}
                  <em className={u.role === "master" ? "tag tag-master" : "tag tag-apprentice"}>
                    {u.role === "master" ? "师傅" : "学徒"}
                  </em>
                </button>
              ))}
            </div>
          </div>
          <div className="control-block">
            <small>网络</small>
            <button
              className={online ? "net-switch online" : "net-switch offline"}
              onClick={() => setOnline(!online)}
            >
              <span className="dot" />
              {online ? "在线" : "离线（车间角落）"}
            </button>
          </div>
        </div>
      </div>

      <div className="metrics">
        <article>
          <small>待修复</small>
          <strong>{repairing}</strong>
        </article>
        <article>
          <small>纹样档案</small>
          <strong>{total}</strong>
        </article>
        <article>
          <small>材料色卡批次</small>
          <strong>{batches.length}</strong>
        </article>
        <article>
          <small>完工率</small>
          <strong>{rate}%</strong>
        </article>
      </div>
    </header>
  );
}
