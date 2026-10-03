import { useStore } from "../store";
import MarkingStage from "./MarkingStage";
import ColorCardPanel from "./ColorCardPanel";
import ProcessStepper from "./ProcessStepper";

export default function CarpetDetail() {
  const { carpets, selectedId, exportCsv } = useStore();
  const carpet = carpets.find((c) => c.id === selectedId);

  if (!carpet) {
    return (
      <section className="panel detail-panel">
        <p className="empty">请选择一条纹样档案</p>
      </section>
    );
  }

  return (
    <section className="panel detail-panel">
      <div className="heading">
        <div>
          <p>修复档案</p>
          <h2>
            {carpet.code}
            <span className="detail-origin">
              {" "}
              · {carpet.origin} · {carpet.era}
            </span>
          </h2>
        </div>
        <button onClick={exportCsv}>导出CSV</button>
      </div>

      <div className="detail-specs">
        <span>材质：{carpet.material}</span>
        <span>染色：{carpet.dyeType}</span>
        <span>结密度：{carpet.knotDensity}</span>
        <span>
          版本：v{carpet.version}（{carpet.updatedBy} 保存）
        </span>
      </div>

      <div className="detail-grid">
        <MarkingStage carpet={carpet} />
        <ColorCardPanel carpet={carpet} />
      </div>
      <ProcessStepper carpet={carpet} />
    </section>
  );
}
