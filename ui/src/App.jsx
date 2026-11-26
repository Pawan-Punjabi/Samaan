import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Save, Sun, Moon } from 'lucide-react';
import FlowCanvas from './components/FlowCanvas';
import NodeInspector from './components/NodeInspector';
import { checkHealth, exportFlowCsv, loadSampleFlow, runFlow } from './api/client';

const STORAGE_KEY = 'retailflow_custom_flow_v2';

const TEMPLATES = [
  { id: 'reorder_po', label: 'Reorder PO Flow' },
  { id: 'margin_summary', label: 'Sales & Category' },
  { id: 'blank', label: 'Blank Canvas' },
];

export default function App() {
  const [theme, setTheme] = useState('light');
  const [backendOnline, setBackendOnline] = useState(false);
  const [template, setTemplate] = useState('reorder_po');
  const [graph, setGraph] = useState(null);
  const [execution, setExecution] = useState(null);
  const [selectedId, setSelectedId] = useState('output');
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const stepCounter = useRef(1);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const execute = useCallback(async (nextGraph) => {
    setIsRunning(true);
    setError('');
    try {
      const res = await runFlow(nextGraph);
      setExecution(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const loadTemplate = useCallback(async (tplId) => {
    setTemplate(tplId);
    if (tplId === 'blank') {
      const blankGraph = { nodes: [], edges: [] };
      setGraph(blankGraph);
      setExecution({ ok: true, nodes: {}, summary_metrics: {} });
      setSelectedId(null);
      return;
    }
    setIsRunning(true);
    setError('');
    try {
      const data = await loadSampleFlow(tplId);
      setGraph(data.graph);
      setExecution(data.execution);
      setSelectedId(data.graph.nodes[data.graph.nodes.length - 1]?.id || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    checkHealth()
      .then(() => {
        setBackendOnline(true);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.nodes?.length) {
              setGraph(parsed);
              setSelectedId(parsed.nodes[parsed.nodes.length - 1].id);
              execute(parsed);
              return;
            }
          } catch {
            // Fall back to sample template
          }
        }
        loadTemplate('reorder_po');
      })
      .catch(() => setBackendOnline(false));
  }, [execute, loadTemplate]);

  const commitGraph = (nextGraph, autoRun = true) => {
    setGraph(nextGraph);
    if (autoRun) execute(nextGraph);
  };

  const handleUpdateNode = (nodeId, patch) => {
    if (!graph) return;
    commitGraph({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    });
  };

  const handleMoveNode = (nodeId, x, y) => {
    setGraph((g) =>
      g ? { ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) } : g
    );
  };

  const handleAddNode = (item) => {
    if (!graph) return;
    const id = `step_${Date.now()}_${stepCounter.current++}`;
    const last = graph.nodes[graph.nodes.length - 1];
    const x = last ? (last.x || 0) + 240 : 40;
    const y = last ? last.y || 60 : 60;
    const newNode = {
      id,
      type: item.type,
      label: item.label,
      x,
      y,
      enabled: true,
      params: item.type === 'input_csv' ? { role: 'csv' } : {},
    };
    commitGraph({ ...graph, nodes: [...graph.nodes, newNode] });
    setSelectedId(id);
  };

  const handleDeleteNode = (nodeId) => {
    if (!graph) return;
    const nextNodes = graph.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = graph.edges.filter((e) => e.from_node !== nodeId && e.to_node !== nodeId);
    commitGraph({ nodes: nextNodes, edges: nextEdges });
    setSelectedId(nextNodes[0]?.id || null);
  };

  const handleConnect = (fromNode, toNode) => {
    if (!graph) return;
    if (graph.edges.some((e) => e.from_node === fromNode && e.to_node === toNode)) return;
    commitGraph({ ...graph, edges: [...graph.edges, { from_node: fromNode, to_node: toNode }] });
  };

  const handleDisconnect = (fromNode, toNode) => {
    if (!graph) return;
    commitGraph({
      ...graph,
      edges: graph.edges.filter((e) => !(e.from_node === fromNode && e.to_node === toNode)),
    });
  };

  const handleAutoLayout = () => {
    if (!graph) return;
    const nextNodes = graph.nodes.map((n, idx) => ({
      ...n,
      x: 32 + (idx % 5) * 244,
      y: 28 + Math.floor(idx / 5) * 124,
    }));
    setGraph({ ...graph, nodes: nextNodes });
  };

  const handleSaveFlow = () => {
    if (!graph) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    setNotice('Saved');
    setTimeout(() => setNotice(''), 2000);
  };

  const selectedNode = graph?.nodes?.find((n) => n.id === selectedId) || graph?.nodes?.[0] || null;
  const selectedResult = selectedNode ? execution?.nodes?.[selectedNode.id] : null;
  const parentEdges = selectedNode ? (graph?.edges || []).filter((e) => e.to_node === selectedNode.id) : [];
  const upstreamColumns = parentEdges[0] ? execution?.nodes?.[parentEdges[0].from_node]?.columns || [] : [];
  const leftColumns = parentEdges[0] ? execution?.nodes?.[parentEdges[0].from_node]?.columns || [] : [];
  const rightColumns = parentEdges[1] ? execution?.nodes?.[parentEdges[1].from_node]?.columns || [] : [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="no-print" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 24px' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>
              R
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>RetailFlow — Visual Data Studio</div>
              <div style={{ fontSize: 11.5, color: backendOnline ? 'var(--success)' : 'var(--danger)' }}>
                {backendOnline ? 'Click any step to edit, filter, rename, calculate, or sort live rows' : 'Backend Offline (start uvicorn on port 8000)'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Clean Segmented Template Switcher */}
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 6, background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              {TEMPLATES.map((tpl) => {
                const active = template === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={!backendOnline || isRunning}
                    onClick={() => {
                      localStorage.removeItem(STORAGE_KEY);
                      loadTemplate(tpl.id);
                    }}
                    style={{
                      border: 'none',
                      padding: '5px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                  >
                    {tpl.label}
                  </button>
                );
              })}
            </div>

            <button type="button" className="btn" disabled={!graph} onClick={handleSaveFlow}>
              <Save size={14} aria-hidden="true" /> {notice || 'Save Flow'}
            </button>
            <button type="button" className="btn btn-cta" disabled={!graph || isRunning} onClick={() => graph && execute(graph)}>
              <Play size={14} aria-hidden="true" /> {isRunning ? 'Running…' : 'Run Flow'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1360, width: '100%', margin: '0 auto', padding: '16px 24px 56px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div className="panel" role="alert" style={{ padding: '10px 14px', borderColor: 'var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {graph && (
          <>
            <FlowCanvas
              graph={graph}
              execution={execution}
              selectedId={selectedId}
              onSelectNode={setSelectedId}
              onMoveNode={handleMoveNode}
              onAddNode={handleAddNode}
              onConnectNodes={handleConnect}
              onDisconnectEdge={handleDisconnect}
              onAutoLayout={handleAutoLayout}
            />
            <NodeInspector
              node={selectedNode}
              nodeResult={selectedResult}
              upstreamColumns={upstreamColumns}
              leftColumns={leftColumns}
              rightColumns={rightColumns}
              summaryMetrics={execution?.summary_metrics}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onExport={(exportType, filename, nodeId) =>
                graph && exportFlowCsv(graph, exportType, filename, nodeId).catch((e) => setError(e.message))
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
