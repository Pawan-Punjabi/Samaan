import { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Filter,
  SlidersHorizontal,
  Sigma,
  BarChart2,
  GitMerge,
  Calculator,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Plus,
  LayoutGrid,
  Unlink,
} from 'lucide-react';

const NODE_CATALOG = [
  { type: 'input_csv', label: 'CSV Input', roleLabel: 'Source', icon: FileSpreadsheet, ins: 0, outs: 1 },
  { type: 'clean_sales', label: 'Clean & Dedupe', roleLabel: 'Transform', icon: Filter, ins: 1, outs: 1 },
  { type: 'filter_rows', label: 'Filter Rows', roleLabel: 'Transform', icon: SlidersHorizontal, ins: 1, outs: 1 },
  { type: 'formula', label: 'Formula Column', roleLabel: 'Transform', icon: Sigma, ins: 1, outs: 1 },
  { type: 'summarize', label: 'Group & Sum', roleLabel: 'Transform', icon: BarChart2, ins: 1, outs: 1 },
  { type: 'merge_sku', label: 'Merge on SKU', roleLabel: 'Join', icon: GitMerge, ins: 2, outs: 1 },
  { type: 'reorder_rules', label: 'Reorder Rules', roleLabel: 'Rules', icon: Calculator, ins: 1, outs: 1 },
  { type: 'action_output', label: 'Action Output', roleLabel: 'Output', icon: ClipboardCheck, ins: 1, outs: 0 },
];

const CATALOG_MAP = Object.fromEntries(NODE_CATALOG.map((item) => [item.type, item]));
const NODE_W = 204;
const NODE_H = 88;

function connectorPath(from, to) {
  const x1 = (from.x || 0) + NODE_W;
  const y1 = (from.y || 0) + NODE_H / 2;
  const x2 = to.x || 0;
  const y2 = (to.y || 0) + NODE_H / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export default function FlowCanvas({
  graph,
  execution,
  selectedId,
  onSelectNode,
  onMoveNode,
  onAddNode,
  onConnectNodes,
  onDisconnectEdge,
  onAutoLayout,
}) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const exeNodes = execution?.nodes || {};
  const [wiringFrom, setWiringFrom] = useState(null);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);

  const handlePointerDown = (e, node) => {
    if (e.target.closest('[data-port]')) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      id: node.id,
      offsetX: e.clientX - rect.left - (node.x || 0),
      offsetY: e.clientY - rect.top - (node.y || 0),
    };
    onSelectNode(node.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const nextX = Math.max(12, Math.round(e.clientX - rect.left - d.offsetX));
    const nextY = Math.max(12, Math.round(e.clientY - rect.top - d.offsetY));
    onMoveNode(d.id, nextX, nextY);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const maxX = Math.max(1240, ...nodes.map((n) => (n.x || 0) + NODE_W + 40));
  const maxY = Math.max(270, ...nodes.map((n) => (n.y || 0) + NODE_H + 36));

  return (
    <section className="panel no-print" style={{ overflow: 'hidden' }}>
      {/* Parabola-style Step Library Toolbar */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)', marginRight: 4 }}>
            ADD STEP:
          </span>
          {NODE_CATALOG.map((item) => (
            <button
              key={item.type}
              type="button"
              className="btn"
              onClick={() => onAddNode(item)}
              style={{ minHeight: 28, padding: '3px 9px', fontSize: 11.5 }}
            >
              <Plus size={12} aria-hidden="true" /> {item.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {wiringFrom && (
            <button
              type="button"
              className="btn"
              onClick={() => setWiringFrom(null)}
              style={{ minHeight: 28, padding: '3px 9px', fontSize: 11.5, borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Click an input port (or Cancel wiring)
            </button>
          )}
          <button type="button" className="btn" onClick={onAutoLayout} style={{ minHeight: 28, padding: '3px 9px', fontSize: 11.5 }}>
            <LayoutGrid size={12} aria-hidden="true" /> Auto Layout
          </button>
        </div>
      </div>

      {/* Draggable Canvas */}
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 340,
          background: 'var(--surface-muted)',
        }}
      >
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ position: 'relative', width: maxX, height: maxY }}
        >
          <svg
            width={maxX}
            height={maxY}
            style={{ position: 'absolute', inset: 0 }}
          >
            {edges.map((e) => {
              const p1 = nodes.find((n) => n.id === e.from_node);
              const p2 = nodes.find((n) => n.id === e.to_node);
              if (!p1 || !p2) return null;
              const srcRes = exeNodes[e.from_node];
              const stroke = srcRes?.status === 'error' ? 'var(--danger)' : 'var(--border-strong)';
              const midX = ((p1.x || 0) + NODE_W + (p2.x || 0)) / 2;
              const midY = ((p1.y || 0) + NODE_H / 2 + ((p2.y || 0) + NODE_H / 2)) / 2;
              return (
                <g key={`${e.from_node}-${e.to_node}`}>
                  <path d={connectorPath(p1, p2)} fill="none" stroke={stroke} strokeWidth="2" />
                  <g
                    style={{ cursor: 'pointer' }}
                    onClick={() => onDisconnectEdge(e.from_node, e.to_node)}
                  >
                    <title>Click to disconnect wire</title>
                    <circle cx={midX} cy={midY} r="9" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1" />
                    <Unlink x={midX - 5} y={midY - 5} size={10} color="var(--text-soft)" />
                  </g>
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const meta = CATALOG_MAP[node.type] || NODE_CATALOG[0];
            const Icon = meta.icon;
            const res = exeNodes[node.id];
            const isSelected = selectedId === node.id;
            const isError = res?.status === 'error';
            const isSkipped = res?.status === 'skipped';

            let borderColor = 'var(--border)';
            if (isError) borderColor = 'var(--danger)';
            else if (isSelected) borderColor = 'var(--primary)';

            return (
              <div
                key={node.id}
                onPointerDown={(e) => handlePointerDown(e, node)}
                style={{
                  position: 'absolute',
                  left: node.x || 0,
                  top: node.y || 0,
                  width: NODE_W,
                  height: NODE_H,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `${isSelected || isError ? 2 : 1}px solid ${borderColor}`,
                  background: 'var(--surface)',
                  cursor: 'grab',
                  userSelect: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  opacity: node.enabled === false || isSkipped ? 0.65 : 1,
                }}
              >
                {/* Input Port */}
                {meta.ins > 0 && (
                  <button
                    type="button"
                    data-port="in"
                    aria-label={`Connect wire into ${node.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (wiringFrom && wiringFrom !== node.id) {
                        onConnectNodes(wiringFrom, node.id);
                        setWiringFrom(null);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: -7,
                      top: NODE_H / 2 - 7,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `2px solid ${wiringFrom && wiringFrom !== node.id ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: wiringFrom && wiringFrom !== node.id ? 'var(--accent-soft)' : 'var(--surface)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                    <Icon size={14} color={isError ? 'var(--danger)' : 'var(--primary)'} aria-hidden="true" />
                    {node.label}
                  </span>
                  {isError ? (
                    <AlertTriangle size={13} color="var(--danger)" aria-hidden="true" />
                  ) : node.enabled === false ? (
                    <PauseCircle size={13} color="var(--text-soft)" aria-hidden="true" />
                  ) : res?.status === 'ok' ? (
                    <CheckCircle2 size={13} color="var(--success)" aria-hidden="true" />
                  ) : null}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>{meta.roleLabel}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isError ? 'var(--danger)' : 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {res?.summary || 'Connect'}
                  </span>
                </div>

                {/* Output Port */}
                {meta.outs > 0 && (
                  <button
                    type="button"
                    data-port="out"
                    aria-label={`Start wire from ${node.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setWiringFrom((cur) => (cur === node.id ? null : node.id));
                    }}
                    style={{
                      position: 'absolute',
                      right: -7,
                      top: NODE_H / 2 - 7,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `2px solid ${wiringFrom === node.id ? 'var(--accent)' : 'var(--primary)'}`,
                      background: wiringFrom === node.id ? 'var(--accent)' : 'var(--surface)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
