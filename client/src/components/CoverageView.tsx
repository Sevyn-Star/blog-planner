import { useCallback, useEffect, useState } from 'react';
import { fetchCoverage, subscribeToUpdates, type CoverageStat } from '../api';

export default function CoverageView() {
  const [stats, setStats] = useState<CoverageStat[]>([]);

  const load = useCallback(() => {
    fetchCoverage().then(setStats);
  }, []);

  useEffect(() => {
    load();
    return subscribeToUpdates(load);
  }, [load]);

  if (stats.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h3>没有层级数据</h3>
        <p>在 taxonomy.yaml 中定义层级结构</p>
      </div>
    );
  }

  const totalPublished = stats.reduce((s, x) => s + x.published, 0);
  const totalAll = stats.reduce((s, x) => s + x.total, 0);

  return (
    <div className="view-stack">
      <div className="summary-row">
        <div className="summary-card">
          <span className="summary-value">{totalAll}</span>
          <span className="summary-label">总主题</span>
        </div>
        <div className="summary-card summary-success">
          <span className="summary-value">{totalPublished}</span>
          <span className="summary-label">已发布</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{stats.length}</span>
          <span className="summary-label">层级路径</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="coverage-table">
          <thead>
            <tr>
              <th>层级路径</th>
              <th>已发布</th>
              <th>草稿</th>
              <th>大纲</th>
              <th>想法</th>
              <th>覆盖度</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.path}>
                <td>
                  <span className="path-cell">{s.path}</span>
                </td>
                <td><span className="num published">{s.published}</span></td>
                <td><span className="num draft">{s.draft}</span></td>
                <td><span className="num outline">{s.outline}</span></td>
                <td><span className="num idea">{s.idea}</span></td>
                <td>
                  <div className="coverage-bar-wrap">
                    <div className="coverage-bar">
                      {s.published > 0 && <span className="published" style={{ flex: s.published }} />}
                      {s.draft > 0 && <span className="draft" style={{ flex: s.draft }} />}
                      {s.outline > 0 && <span className="outline" style={{ flex: s.outline }} />}
                      {s.idea > 0 && <span className="idea" style={{ flex: s.idea }} />}
                    </div>
                    <span className="coverage-total">{s.total}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
