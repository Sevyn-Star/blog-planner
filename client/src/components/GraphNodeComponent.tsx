import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { GraphNode } from '../api';
import { STATUS_LABELS } from '../api';
import { useGraphEdit } from './GraphEditContext';
import { getHandlePositions, useLayoutDirection } from './LayoutDirectionContext';

const POSITION_MAP = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

function GraphNodeComponent({ id, data }: NodeProps<GraphNode>) {
  const edit = useGraphEdit();
  const direction = useLayoutDirection();
  const handles = getHandlePositions(direction);

  const isCategory = data.type === 'category';
  const isOutline = data.type === 'outline';
  const statusClass = data.status || '';

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isOutline && data.parentTopicId) {
        edit?.onEditNode(data.parentTopicId, 'topic', data.label);
        return;
      }
      edit?.onEditNode(id, data.type === 'outline' ? 'topic' : data.type, data.label);
    },
    [edit, id, data.type, data.label, data.parentTopicId, isOutline],
  );

  return (
    <div
      className={`graph-node ${isCategory ? 'category' : isOutline ? 'outline' : `topic ${statusClass}`}`}
      title={isCategory ? '双击编辑分类' : isOutline ? '双击编辑所属主题' : '双击编辑主题'}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          if (isOutline && data.parentTopicId) {
            edit?.onEditNode(data.parentTopicId, 'topic', data.label);
          } else if (data.type === 'topic' || data.type === 'category') {
            edit?.onEditNode(id, data.type, data.label);
          }
        }
      }}
    >
      <Handle type="target" position={POSITION_MAP[handles.target]} className="graph-handle" />
      <div className="graph-node-label">{data.label}</div>
      {isOutline && <div className="graph-node-status">大纲</div>}
      {!isCategory && !isOutline && data.status && (
        <div className="graph-node-status">{STATUS_LABELS[data.status]}</div>
      )}
      <Handle type="source" position={POSITION_MAP[handles.source]} className="graph-handle" />
    </div>
  );
}

export default memo(GraphNodeComponent);
