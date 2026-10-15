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
  type Node,
  type NodeProps,
  type NodeChange,
  type Connection,
} from '@xyflow/react';
import { Server, Globe, Pentagon } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { ObjectNode, Relation } from './api';

type GraphData = { label: string; kind: string; subtitle: string };
const ObjectCard = memo(function ObjectCard({ data, selected }: NodeProps<Node<GraphData>>) {
  const Icon =
    data.kind === 'host'
      ? Server
      : data.kind === 'service' || data.kind === 'url'
        ? Globe
        : Pentagon;
  return (
    <div className={'object-card ' + data.kind + (selected ? ' selected' : '')}>
      <Handle type="target" position={Position.Left} />
      <div className="object-kind">
        <Icon size={14} />
        {data.kind}
        <span className={'dot ' + (data.kind === 'custom' ? 'amber' : 'green')} />
      </div>
      <strong>{data.label}</strong>
      <small>{data.subtitle}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { object: ObjectCard };
function FitOnResize() {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const count = useStore((s) => s.nodeLookup.size);
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = setTimeout(() => {
      void fitView({ padding: 0.3, maxZoom: 1.2 });
    }, 180);
    return () => clearTimeout(timer);
  }, [width, height, count, fitView]);
  return null;
}

export default function Graph({
  objects,
  relations,
  selectedId,
  onSelect,
  onMove,
  onConnect,
  onEdge,
  onContext,
}: {
  selectedId: string | null;
  objects: ObjectNode[];
  relations: Relation[];
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (connection: Connection) => void;
  onEdge: (id: string) => void;
  onContext: (id: string, x: number, y: number) => void;
}) {
  const source = useMemo(
    () =>
      objects.map((n) => ({
        id: n.id,
        type: 'object',
        selected: n.id === selectedId,
        position: { x: n.x, y: n.y },
        data: {
          label: n.label,
          kind: n.kind,
          subtitle:
            n.kind === 'custom'
              ? 'Manual · hypothesis'
              : n.kind === 'url'
                ? String(n.attrs.title || n.attrs.status || 'Observed web resource')
                : n.kind === 'host'
                  ? String(n.attrs.state || 'unknown')
                  : [n.attrs.product, n.attrs.version].filter(Boolean).join(' ') ||
                    'Nmap · observed service',
        },
      })),
    [objects, selectedId],
  );
  const [nodes, setNodes] = useState<Node<GraphData>[]>(source);
  const dragging = useRef(false);
  const moved = useRef(new Map<string, { x: number; y: number }>());
  useEffect(() => {
    if (dragging.current) return;
    setNodes((previous) =>
      source.map((n) => {
        const position = moved.current.get(n.id);
        if (position && position.x === n.position.x && position.y === n.position.y)
          moved.current.delete(n.id);
        return { ...n, position: position || n.position };
      }),
    );
  }, [source]);
  const edges = useMemo(
    () =>
      relations.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.kind,
        style: {
          stroke: e.evidence ? '#69788e' : '#9b8afb',
          strokeWidth: 1.3,
          strokeDasharray: e.evidence ? undefined : '5 5',
        },
        labelStyle: { fill: '#939bac', fontSize: 10 },
        labelBgStyle: { fill: '#11151d' },
      })),
    [relations],
  );
  return (
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
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
      onlyRenderVisibleElements
      deleteKeyCode={null}
      colorMode="dark"
      minZoom={0.15}
      maxZoom={2}
    >
      <FitOnResize />
      <Background gap={22} size={1} color="#282f3d" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) =>
          n.data.kind === 'host' ? '#9b8afb' : n.data.kind === 'custom' ? '#e5ae64' : '#53c79d'
        }
      />
    </ReactFlow>
  );
}
