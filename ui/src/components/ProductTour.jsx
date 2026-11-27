import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const TOUR_STEPS = [
  {
    target: '[data-tour="templates"]',
    title: '1. Choose a Workflow Template',
    body: 'Start with the pre-wired Reorder PO Flow, explore Sales & Category summaries, or switch to a Blank Canvas.',
    preferredSide: 'bottom',
  },
  {
    target: '[data-tour="step-library"]',
    title: '2. Add Processing Steps',
    body: 'Click any step in the library—Input, Clean, Filter, Formula, Group & Sum, Merge, Reorder Rules, or Output—to add it to your pipeline.',
    preferredSide: 'bottom',
  },
  {
    target: '[data-tour="flow-canvas"]',
    title: '3. Wire & Inspect the Flow Canvas',
    body: 'Drag cards to arrange your DAG and connect circular ports. Each node shows its live status checkmark, row count, and summary.',
    preferredSide: 'bottom',
    selectNodeId: 'clean',
  },
  {
    target: '[data-tour="inspector-controls"]',
    title: '4. Configure Step Rules',
    body: 'Select any node to upload CSV/Excel files, toggle duplicate and return removal, or tune reorder cover-day thresholds.',
    preferredSide: 'right',
    selectNodeId: 'reorder',
  },
  {
    target: '[data-tour="inspector-table"]',
    title: '5. Filter & Sort Live Output',
    body: 'Every node caches an inspectable preview table with inferred column types, instant text filtering, and column sorting.',
    preferredSide: 'left',
    selectNodeId: 'reorder',
  },
  {
    target: '[data-tour="run-flow"]',
    title: '6. Run & Export Actionable CSVs',
    body: 'Click Run Flow after editing parameters, or select PO & Action Output below to export Reorder PO and Dead Stock Clearance CSVs.',
    preferredSide: 'bottom',
    selectNodeId: 'output',
  },
];

function computePopoverPosition(rect, preferredSide, cardW, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spotPad = 6;
  const gap = 14 + spotPad;
  const pad = 12;

  const fitsBottom = rect.bottom + gap + cardH <= vh - pad;
  const fitsTop = rect.top - gap - cardH >= pad;
  const fitsRight = rect.right + gap + cardW <= vw - pad;
  const fitsLeft = rect.left - gap - cardW >= pad;

  let side = preferredSide;
  if (side === 'bottom' && !fitsBottom) side = fitsTop ? 'top' : fitsRight ? 'right' : 'bottom';
  if (side === 'top' && !fitsTop) side = fitsBottom ? 'bottom' : 'top';
  if (side === 'right' && !fitsRight) side = fitsLeft ? 'left' : fitsBottom ? 'bottom' : 'top';
  if (side === 'left' && !fitsLeft) side = fitsRight ? 'right' : fitsBottom ? 'bottom' : 'top';

  let top = rect.bottom + gap;
  let left = rect.left;

  if (side === 'top') {
    top = rect.top - gap - cardH;
    left = rect.left;
  } else if (side === 'right') {
    top = rect.top - spotPad;
    left = rect.right + gap;
  } else if (side === 'left') {
    top = rect.top - spotPad;
    left = rect.left - gap - cardW;
  }

  left = Math.max(pad, Math.min(left, vw - cardW - pad));
  top = Math.max(pad, Math.min(top, vh - cardH - pad));
  return { top, left };
}

export default function ProductTour({ onClose, onSelectNode, graphNodes }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);

  const step = TOUR_STEPS[stepIdx];

  const measureTarget = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
  }, [step]);

  // Select contextual node for the active step and scroll target into view
  useEffect(() => {
    if (!step) return;

    if (step.selectNodeId && graphNodes?.some((n) => n.id === step.selectNodeId)) {
      onSelectNode?.(step.selectNodeId);
    }

    const el = document.querySelector(step.target);
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }

    const t1 = setTimeout(measureTarget, 40);
    const t2 = setTimeout(measureTarget, 180);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stepIdx, step, graphNodes, onSelectNode, measureTarget]);

  // Reposition spotlight on resize / scroll
  useEffect(() => {
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [measureTarget]);

  // Keyboard navigation (Escape, ArrowRight, ArrowLeft)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') {
        if (stepIdx < TOUR_STEPS.length - 1) setStepIdx((i) => i + 1);
        else onClose();
      } else if (e.key === 'ArrowLeft' && stepIdx > 0) {
        setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIdx, onClose]);

  if (!step) return null;

  const cardW = Math.min(350, window.innerWidth - 24);
  const cardH = 210;
  const spotPad = 6;
  const pos = rect
    ? computePopoverPosition(rect, step.preferredSide, cardW, cardH)
    : { top: Math.max(24, (window.innerHeight - cardH) / 2), left: Math.max(12, (window.innerWidth - cardW) / 2) };

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div
      className="no-print"
      role="dialog"
      aria-modal="true"
      aria-label={`Product tour step ${stepIdx + 1} of ${TOUR_STEPS.length}: ${step.title}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      {/* Clickable backdrop outside spotlight closes tour */}
      {!rect && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 15, 26, 0.58)',
          }}
        />
      )}

      {/* Spotlight Ring using large box-shadow cutout */}
      {rect && (
        <>
          <div
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: Math.max(4, rect.top - spotPad),
              left: Math.max(4, rect.left - spotPad),
              width: rect.width + spotPad * 2,
              height: rect.height + spotPad * 2,
              borderRadius: 8,
              border: '2px solid var(--primary)',
              boxShadow: '0 0 0 9999px rgba(10, 15, 26, 0.58)',
              pointerEvents: 'none',
              transition: 'all 0.2s ease',
            }}
          />
        </>
      )}

      {/* Floating Tour Card */}
      <div
        className="panel"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: cardW,
          padding: 16,
          zIndex: 1001,
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          transition: 'top 0.2s ease, left 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span
            className="tag tag-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Sparkles size={12} aria-hidden="true" />
            Step {stepIdx + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            className="btn"
            aria-label="Close product tour"
            onClick={onClose}
            style={{ minHeight: 26, padding: '2px 6px' }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {step.title}
          </h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {step.body}
          </p>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Go to tour step ${idx + 1}`}
              onClick={() => setStepIdx(idx)}
              style={{
                width: idx === stepIdx ? 18 : 7,
                height: 7,
                borderRadius: 99,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: idx === stepIdx ? 'var(--primary)' : 'var(--border-strong)',
                transition: 'width 0.15s ease, background-color 0.15s ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-soft)',
              fontSize: 12.5,
              cursor: 'pointer',
              padding: '4px 2px',
              fontFamily: 'inherit',
            }}
          >
            Skip tour
          </button>

          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <button
                type="button"
                className="btn"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                style={{ minHeight: 30, padding: '4px 10px', fontSize: 12.5 }}
              >
                <ChevronLeft size={14} aria-hidden="true" /> Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (isLast ? onClose() : setStepIdx((i) => i + 1))}
              style={{ minHeight: 30, padding: '4px 12px', fontSize: 12.5 }}
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
