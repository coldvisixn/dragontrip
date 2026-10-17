import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  useReactFlow,
  useStore,
  type ReactFlowInstance,
  type Viewport,
  type Edge as FlowEdge,
  type Node,
  type NodeProps,
  type NodeChange,
  type Connection,
} from '@xyflow/react';
import { Server, Globe, Pentagon, FileText, Box, Lightbulb, ListTodo, Link } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { api, type ObjectNode, type Relation } from './api';
import { getWorkspace, putWorkspace } from './workspace';

type GraphData = {
  label: string;
  kind: string;
  category: string;
  subtitle: string;
  status: string;
  provenance: string;
  tags: string[];
  compact: boolean;
};
const categoryIcons: Record<string, typeof Server> = {
  note: FileText,
  asset: Box,
  hypothesis: Lightbulb,
  task: ListTodo,
  reference: Link,
};
const ObjectCard = memo(function ObjectCard({ data, selected }: NodeProps<Node<GraphData>>) {
  const Icon =
    data.kind === 'host'
      ? Server
      : data.kind === 'service' || data.kind === 'url'
        ? Globe
        : categoryIcons[data.category] || Pentagon;
  const zoomedOut = useStore((state) => state.transform[2] < 0.55);
  const compact = data.compact || zoomedOut;
  return (
    <div
      className={
        'object-card ' +
        data.kind +
        (compact ? ' compact-card' : '') +
        (selected ? ' selected' : '')
      }
    >
      <Handle type="target" position={Position.Left} />
      <div className="object-kind">
        <Icon size={14} />
        {data.category}
      </div>
      <strong>{data.label}</strong>
      {!compact && <small>{data.subtitle}</small>}
      {!compact && (
        <div className="object-footer">
          <span>{data.status}</span>
          <span>{data.provenance}</span>
        </div>
      )}
      {!compact && data.tags.length > 0 && (
        <div className="card-tags">
          {data.tags.slice(0, 2).map((t) => (
            <span key={t}>{t}</span>
          ))}
          {data.tags.length > 2 && <span>+{data.tags.length - 2}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { object: ObjectCard };
function FocusSelection({ selectedId, count }: { selectedId: string | null; count: number }) {
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const first = useRef(count === 0);
  useEffect(() => {
    if (first.current && count > 0) {
      first.current = false;
      void flow.fitView({ padding: 0.3, maxZoom: 1.2 });
    }
  }, [count, flow]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => {
      const node = flow.getNode(selectedId);
      if (!node) return;
      const view = flow.getViewport();
      const left = node.position.x * view.zoom + view.x;
      const top = node.position.y * view.zoom + view.y;
      if (
        view.zoom < 0.5 ||
        left < 0 ||
        left + 225 * view.zoom > width ||
        top < 0 ||
        top + 150 * view.zoom > height
      )
        void flow.setCenter(node.position.x + 112, node.position.y + 75, {
          zoom: Math.max(view.zoom, 0.7),
        });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedId, flow, width, height]);
  return null;
}

export default function Graph({
  projectId,
  detailMode = 'auto',
  theme,
  objects,
  relations,
  selectedId,
  onSelect,
  onMove,
  onConnect,
  onEdge,
  onContext,
}: {
  projectId: string;
  detailMode?: 'auto' | 'full' | 'compact';
  theme?: 'dark' | 'light';
  selectedId: string | null;
  objects: ObjectNode[];
  relations: Relation[];
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (connection: Connection) => void;
  onEdge: (id: string) => void;
  onContext: (id: string, x: number, y: number) => void;
}) {
  const cache = useRef(new Map<string, { fingerprint: string; node: Node<GraphData> }>());
  const [view, setView] = useState<Viewport | null | undefined>();
  const [viewError, setViewError] = useState('');
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flow = useRef<ReactFlowInstance<Node<GraphData>> | null>(null);
  useEffect(() => {
    let disposed = false;
    api<Viewport | null>(`/projects/${projectId}/view`)
      .then((value) => {
        if (!disposed) {
          const cached = getWorkspace<Viewport | null>(projectId, 'graph_view', null);
          setView(cached || (value && Number.isFinite(value.zoom) ? value : null));
        }
      })
      .catch((e) => {
        if (!disposed) {
          setView(getWorkspace<Viewport | null>(projectId, 'graph_view', null));
          setViewError(e.message);
        }
      });
    return () => {
      disposed = true;
      clearTimeout(saveTimer.current);
    };
  }, [projectId]);
  const compact = detailMode === 'compact' || (detailMode === 'auto' && objects.length > 300);
  const source = useMemo(
    () =>
      objects.map((n) => {
        const fingerprint = JSON.stringify([n, compact]);
        const previous = cache.current.get(n.id);
        if (previous?.fingerprint === fingerprint) return previous.node;
        const node: Node<GraphData> = {
          id: n.id,
          type: 'object',
          selected: false,
          position: { x: n.x, y: n.y },
          data: {
            compact,
            provenance:
              n.kind === 'custom' || n.attrs.source === 'manual'
                ? 'Manual'
                : n.attrs.run_id
                  ? 'Imported'
                  : 'Observed',
            label: n.label,
            kind: n.kind,
            category: n.kind === 'custom' ? String(n.attrs.category || 'hypothesis') : n.kind,
            status: String(
              n.kind === 'custom'
                ? n.attrs.status || 'idea'
                : n.attrs.state || n.attrs.status || 'observed',
            ),
            tags: Array.isArray(n.attrs.tags) ? n.attrs.tags.map(String) : [],
            subtitle:
              n.kind === 'custom'
                ? String(n.attrs.description || 'Add context in Inspector')
                : n.kind === 'url'
                  ? String(n.attrs.title || n.attrs.status || 'Observed web resource')
                  : n.kind === 'host'
                    ? String(n.attrs.state || 'unknown')
                    : [n.attrs.product, n.attrs.version].filter(Boolean).join(' ') ||
                      (n.attrs.origin
                        ? String(n.attrs.origin)
                        : String(n.attrs.source || 'Observed service')),
          },
        };
        cache.current.set(n.id, { fingerprint, node });
        return node;
      }),
    [objects, compact],
  );
  const [nodes, setNodes] = useState<Node<GraphData>[]>(source);
  const dragging = useRef(false);
  const moved = useRef(new Map<string, { x: number; y: number }>());
  useEffect(() => {
    if (dragging.current) return;
    const valid = new Set(source.map((node) => node.id));
    for (const id of cache.current.keys())
      if (!valid.has(id)) {
        cache.current.delete(id);
        moved.current.delete(id);
      }
    setNodes((previous) => {
      const existing = new Map(previous.map((node) => [node.id, node]));
      const next = source.map((n) => {
        const position = moved.current.get(n.id);
        if (position && position.x === n.position.x && position.y === n.position.y)
          moved.current.delete(n.id);
        const old = existing.get(n.id);
        const selected = n.id === selectedId;
        if (
          old?.data === n.data &&
          old.selected === selected &&
          old.position.x === (position || n.position).x &&
          old.position.y === (position || n.position).y
        )
          return old;
        return { ...n, selected, position: position || n.position };
      });
      return next.length === previous.length &&
        next.every((node, index) => node === previous[index])
        ? previous
        : next;
    });
  }, [source, selectedId]);
  const edges = useMemo<FlowEdge[]>(
    () =>
      relations.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: relations.length > 500 ? 'straight' : 'default',
        label: relations.length > 500 ? undefined : e.kind,
        style: {
          stroke: e.evidence ? '#69788e' : '#9b8afb',
          strokeWidth: 1.3,
          strokeDasharray: e.evidence ? undefined : '5 5',
        },
        labelStyle: { fill: '#939bac', fontSize: 10 },
        labelBgStyle: { fill: 'var(--surface)' },
      })),
    [relations],
  );
  if (view === undefined) return <div className="loading">Restoring graph…</div>;
  return (
    <>
      {viewError && (
        <div role="alert" className="graph-notice">
          Graph view could not be saved: {viewError}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes: NodeChange<Node<GraphData>>[]) =>
          setNodes((ns) => applyNodeChanges(changes, ns))
        }
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDragStart={() => {
          dragging.current = true;
        }}
        onNodeDragStop={(_, node) => {
          dragging.current = false;
          moved.current.set(node.id, node.position);
          onMove(node.id, node.position.x, node.position.y);
        }}
        onConnect={onConnect}
        onEdgeClick={(_, edge) => onEdge(edge.id)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onContext(node.id, event.clientX, event.clientY);
        }}
        onInit={(instance) => {
          flow.current = instance;
          initialized.current = true;
        }}
        defaultViewport={view || undefined}
        onMoveEnd={(_, viewport) => {
          if (!initialized.current) return;
          putWorkspace(projectId, 'graph_view', viewport);
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            void api(`/projects/${projectId}/view`, 'PUT', viewport).catch((e) =>
              setViewError(e.message),
            );
          }, 400);
        }}
        onKeyDown={(event) => {
          if (
            (event.target as HTMLElement).closest('input,textarea,select') ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            void flow.current?.fitView({ padding: 0.3, maxZoom: 1.2 });
          }
          if (event.key === '+') {
            event.preventDefault();
            void flow.current?.zoomIn();
          }
          if (event.key === '-') {
            event.preventDefault();
            void flow.current?.zoomOut();
          }
        }}
        fitView={!view}
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        onlyRenderVisibleElements
        deleteKeyCode={null}
        colorMode={theme || 'system'}
        minZoom={0.05}
        maxZoom={2}
      >
        <FocusSelection selectedId={selectedId} count={objects.length} />
        <Background gap={22} size={1} color="#282f3d" />
        <Controls showInteractive={false} />
        {objects.length <= 500 && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) =>
              n.data.kind === 'host' ? '#9b8afb' : n.data.kind === 'custom' ? '#e5ae64' : '#53c79d'
            }
          />
        )}
      </ReactFlow>
    </>
  );
}
