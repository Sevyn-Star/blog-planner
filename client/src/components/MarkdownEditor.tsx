import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { fetchTopics } from '../api';
import { renderMarkdownPreview } from '../utils/markdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onOpenTopic?: (topicId: string) => void;
  rows?: number;
}

export default function MarkdownEditor({ value, onChange, onOpenTopic, rows = 8 }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [expanded, setExpanded] = useState(false);
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [linkHint, setLinkHint] = useState('');

  useEffect(() => {
    fetchTopics().then((topics) => setTopicIds(new Set(topics.map((t) => t.id))));
  }, []);

  const previewHtml = useMemo(() => renderMarkdownPreview(value), [value]);

  function handlePreviewClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest('.md-wiki-link') as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const id = target.dataset.topicId || '';
    const raw = target.dataset.topicRaw || id;
    if (topicIds.has(id)) {
      setLinkHint('');
      onOpenTopic?.(id);
      setExpanded(false);
      return;
    }
    setLinkHint(`主题「${raw}」尚未创建，可先在左侧新建主题（ID: ${id}）`);
  }

  const editorBody = (
    <>
      <div className="md-editor-tabs">
        <button
          type="button"
          className={`md-editor-tab${mode === 'edit' ? ' active' : ''}`}
          onClick={() => setMode('edit')}
        >
          编辑
        </button>
        <button
          type="button"
          className={`md-editor-tab${mode === 'preview' ? ' active' : ''}`}
          onClick={() => setMode('preview')}
        >
          预览
        </button>
        <span className="md-editor-hint">保存后正文标题会自动展开为思维导图子节点</span>
      </div>

      {linkHint && <div className="md-editor-link-hint">{linkHint}</div>}

      {mode === 'edit' ? (
        <textarea
          className="content-textarea md-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onDoubleClick={() => setExpanded(true)}
          rows={rows}
          placeholder="支持 Markdown 与 [[主题ID]] 链接"
        />
      ) : (
        <div
          className="md-preview content-textarea"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
          onClick={handlePreviewClick}
        />
      )}
    </>
  );

  return (
    <div className="md-editor">
      {editorBody}

      {expanded && createPortal(
        <div className="md-editor-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <div className="md-editor-expanded">
            <div className="md-editor-expanded-header">
              <h3>编辑正文</h3>
              <button type="button" className="modal-close" onClick={() => setExpanded(false)} aria-label="关闭">×</button>
            </div>
            <div className="md-editor-expanded-body">
              <div className="md-editor-split">
                <div className="md-editor-pane">
                  <div className="md-editor-pane-label">编辑</div>
                  <textarea
                    className="content-textarea md-editor-textarea md-editor-textarea-lg"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="支持 Markdown 与 [[主题ID]] 链接"
                  />
                </div>
                <div className="md-editor-pane">
                  <div className="md-editor-pane-label">预览</div>
                  <div
                    className="md-preview md-preview-lg"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    onClick={handlePreviewClick}
                  />
                </div>
              </div>
            </div>
            <div className="md-editor-expanded-footer">
              <span className="md-editor-footer-hint">预览中点击 [[链接]] 可跳转到对应主题</span>
              <button type="button" className="btn btn-primary" onClick={() => setExpanded(false)}>完成</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
