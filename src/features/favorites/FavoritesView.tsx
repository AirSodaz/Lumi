import { Star } from "lucide-react";
import { GlassPanel } from "../../components/layout";

export function FavoritesView() {
  return (
    <section className="view-stack favorites-view app-workbench" aria-labelledby="favorites-title">
      <header className="workbench-header">
        <div className="workbench-title-block">
          <span className="workbench-kicker">Lumi</span>
          <h1 id="favorites-title">收藏</h1>
          <div className="workbench-meta-row">
            <span>Saved media</span>
            <span>Empty</span>
          </div>
        </div>
      </header>

      <GlassPanel className="empty-state">
        <Star aria-hidden="true" size={22} />
        <strong>暂无收藏</strong>
        <span>收藏的电影、剧集和集数会显示在这里。</span>
      </GlassPanel>
    </section>
  );
}
