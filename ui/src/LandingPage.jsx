import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart2,
  Check,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  GitMerge,
  Menu,
  MousePointer2,
  Sigma,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import './LandingPage.css';

const navigation = [
  { label: 'Home', href: '#top' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'About', href: '#about' },
];

const workflowSteps = [
  { label: 'CSV input', detail: 'Bring in a table', icon: FileSpreadsheet, tone: 'source' },
  { label: 'Clean & dedupe', detail: 'Prepare the rows', icon: Filter, tone: 'transform' },
  { label: 'Group & sum', detail: 'Summarize values', icon: BarChart2, tone: 'analysis' },
  { label: 'Action output', detail: 'Preview or export', icon: Download, tone: 'output' },
];

const features = [
  {
    title: 'Automated data profiling',
    description: 'Inspect inferred column types, null counts, unique values, and row previews as you work.',
    icon: Database,
  },
  {
    title: 'Practical data cleaning',
    description: 'Trim text, remove duplicates and returns, fill selected nulls, and rename or hide columns.',
    icon: Filter,
  },
  {
    title: 'Filters, formulas, and summaries',
    description: 'Filter rows, add safe arithmetic formula columns, and group data with common aggregations.',
    icon: Sigma,
  },
  {
    title: 'Retail joins and reorder rules',
    description: 'Merge sales and stock by SKU, then apply configurable stock, lead-time, and reorder rules.',
    icon: GitMerge,
  },
  {
    title: 'Review and export results',
    description: 'Search and sort per-node previews, inspect execution summaries, and export results as CSV.',
    icon: ClipboardCheck,
  },
];

const processSteps = [
  {
    number: '01',
    title: 'Upload a dataset',
    description: 'Bring in CSV, TSV, Excel, or Parquet files and review the detected columns.',
  },
  {
    number: '02',
    title: 'Build your workflow',
    description: 'Add processing steps to the canvas, then connect them into a pipeline.',
  },
  {
    number: '03',
    title: 'Profile and analyze',
    description: 'Run the flow to inspect row previews, column statistics, and step summaries.',
  },
  {
    number: '04',
    title: 'Review and export',
    description: 'Search or sort results, then export a node preview or supported retail output.',
  },
];

const previewNodes = [
  { className: 'input', title: 'CSV Input', detail: 'Source table', icon: FileSpreadsheet },
  { className: 'clean', title: 'Clean & Dedupe', detail: 'Transform', icon: Filter },
  { className: 'filter', title: 'Filter Rows', detail: 'Transform', icon: SlidersHorizontal },
  { className: 'summary', title: 'Group & Sum', detail: 'Aggregate', icon: BarChart2 },
  { className: 'output', title: 'Action Output', detail: 'Preview & export', icon: Download },
];

function BrandMark({ small = false }) {
  return (
    <span className={`landing-mark${small ? ' landing-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 34 34" fill="none">
        <path d="M9 10.5 24.5 8M9 12l5.5 11M11 25l13-14" />
        <circle cx="8" cy="11" r="3.5" />
        <circle cx="26" cy="7.5" r="3.5" />
        <circle cx="15" cy="25" r="3.5" />
      </svg>
    </span>
  );
}

function HeroWorkflow() {
  return (
    <div className="hero-workflow">
      <div className="hero-workflow-heading">
        <div>
          <span className="hero-workflow-title">A workflow you can follow</span>
          <span className="hero-workflow-caption">Supported node types, connected visually</span>
        </div>
        <MousePointer2 size={16} aria-hidden="true" />
      </div>
      <div className="hero-map" aria-label="Illustration of a connected data workflow">
        <svg className="hero-wires hero-wires-wide" viewBox="0 0 620 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M270 70 C300 70 320 70 350 70" />
          <path d="M595 70 C620 120 400 180 353 230" />
          <path d="M595 230 C520 230 130 230 25 230" />
        </svg>
        <svg className="hero-wires hero-wires-tall" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 22 C50 24 50 26 50 28" />
          <path d="M50 46 C50 48 50 50 50 52" />
          <path d="M50 70 C50 72 50 74 50 76" />
        </svg>
        {workflowSteps.map(({ label, detail, icon: Icon, tone }) => (
          <div className={`hero-node hero-node-${tone}`} key={label}>
            {tone !== 'source' && <span className="hero-node-port hero-node-port-input" aria-hidden="true" />}
            <span className="hero-node-icon"><Icon size={16} aria-hidden="true" /></span>
            <span className="hero-node-copy">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            {tone !== 'output' && <span className="hero-node-port hero-node-port-output" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="hero-workflow-footer">
        <span><Check size={13} aria-hidden="true" /> Column profiles</span>
        <span><Check size={13} aria-hidden="true" /> Per-step previews</span>
        <span><Check size={13} aria-hidden="true" /> CSV export</span>
      </div>
    </div>
  );
}

function WorkflowPreview() {
  return (
    <div className="preview-shell" aria-label="Illustration of supported workflow canvas features">
      <div className="preview-topbar">
        <div className="preview-topbar-brand">
          <BrandMark small />
          <span>Workflow canvas</span>
        </div>
        <span className="preview-topbar-note">Illustration of supported building blocks</span>
      </div>
      <div className="preview-layout">
        <div className="preview-canvas">
          <div className="preview-toolbar" aria-hidden="true">
            <span><MousePointer2 size={13} /> Select</span>
            <span><GitMerge size={13} /> Connect</span>
            <span><BarChart2 size={13} /> Auto layout</span>
          </div>
          <svg className="preview-wires preview-wires-wide" viewBox="0 0 720 386" preserveAspectRatio="none" aria-hidden="true">
            <path d="M223 108 C240 108 252 108 270 108" />
            <path d="M454 108 C470 108 480 108 497 108" />
            <path d="M680 108 C690 155 570 230 497 316" />
            <path d="M680 316 C640 365 330 365 270 316" />
          </svg>
          <svg className="preview-wires preview-wires-tall" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 30 C50 32 50 33 50 34" />
            <path d="M50 47 C50 49 50 50 50 51" />
            <path d="M50 64 C50 66 50 67 50 68" />
            <path d="M50 81 C50 83 50 84 50 85" />
          </svg>
          {previewNodes.map(({ className, title, detail, icon: Icon }) => (
            <div className={`preview-node preview-node-${className}`} key={className}>
              {className !== 'input' && <span className="preview-node-port preview-node-port-input" aria-hidden="true" />}
              <span className={`preview-node-icon preview-node-icon-${className}`}>
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="preview-node-label">
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              {className !== 'output' && <span className="preview-node-port preview-node-port-output" aria-hidden="true" />}
            </div>
          ))}
          <span className="preview-canvas-caption">Example sequence · node types available in the prototype</span>
        </div>
        <aside className="preview-inspector">
          <div className="inspector-heading">
            <span className="inspector-heading-icon"><Database size={15} aria-hidden="true" /></span>
            <div>
              <strong>Column profile</strong>
              <small>Available in node results</small>
            </div>
          </div>
          <div className="inspector-fields">
            <div><span>Inferred type</span><strong>Per column</strong></div>
            <div><span>Null count</span><strong>Per column</strong></div>
            <div><span>Unique values</span><strong>Per column</strong></div>
            <div><span>Row preview</span><strong>Per node</strong></div>
          </div>
          <div className="inspector-export">
            <Download size={14} aria-hidden="true" />
            <span>Export supported results to CSV</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page" id="top">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a className="landing-brand" href="#top" onClick={closeMenu} aria-label="DataFlow home">
            <BrandMark />
            <span className="landing-brand-name">DataFlow<span>VISUAL ANALYTICS</span></span>
          </a>
          <button
            type="button"
            className="landing-menu-toggle"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav
            className={`landing-links${menuOpen ? ' landing-links-open' : ''}`}
            id="landing-navigation"
            aria-label="Main navigation"
          >
            {navigation.map(({ label, href }) => (
              <a href={href} key={href} onClick={closeMenu}>{label}</a>
            ))}
          </nav>
          <a className="landing-nav-cta" href="/app">
            Launch App <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">INTERACTIVE DATA WORKFLOWS</p>
              <h1>Transform raw data into <span>meaningful insights.</span></h1>
              <p className="landing-hero-description">
                An interactive node-based data profiling and analytics platform that simplifies data exploration,
                automates profiling workflows, and helps users understand their datasets through a visual, connected workspace.
              </p>
              <div className="landing-hero-actions">
                <a className="landing-button landing-button-primary" href="/app">
                  Get started <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a className="landing-button landing-button-secondary" href="#features">
                  Explore features
                </a>
              </div>
              <p className="landing-hero-note">Built around practical profiling, transformations, and retail analytics.</p>
            </div>
            <HeroWorkflow />
          </div>
          <div className="landing-hero-rule" aria-hidden="true" />
        </section>

        <section className="landing-section landing-features" id="features">
          <div className="landing-section-intro">
            <div>
              <p className="landing-eyebrow">A WORKSPACE WITH A CLEAR PURPOSE</p>
              <h2>Make each data step visible.</h2>
            </div>
            <p>
              Connect supported operations, run them in order, and inspect what each step produces.
              Profiling, transformation, and export tools are all available from the connected canvas.
            </p>
          </div>
          <div className="features-content">
            <article className="feature-lead">
              <div className="feature-lead-icon"><GitMerge size={19} aria-hidden="true" /></div>
              <h3>Interactive node-based workflow</h3>
              <p>
                Add steps, connect inputs and outputs, move nodes around the canvas, and run a workflow without
                writing each transformation by hand.
              </p>
              <div className="feature-flow" aria-label="Source, transform, and output workflow">
                <span>Source</span><i /><span>Transform</span><i /><span>Output</span>
              </div>
              <a href="/app" className="feature-text-link">Open the workspace <ArrowUpRight size={14} aria-hidden="true" /></a>
            </article>
            <div className="feature-list">
              {features.map(({ title, description, icon: Icon }) => (
                <article className="feature-row" key={title}>
                  <span className="feature-row-icon"><Icon size={17} aria-hidden="true" /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-process" id="how-it-works">
          <div className="process-heading">
            <div>
              <p className="landing-eyebrow">FROM FILE TO RESULT</p>
              <h2>A straightforward path through your data.</h2>
            </div>
            <p>Each run gives you a closer look at how data moves through the workflow.</p>
          </div>
          <ol className="process-steps">
            {processSteps.map(({ number, title, description }) => (
              <li className="process-step" key={number}>
                <span className="process-number">{number}</span>
                <div className="process-marker" aria-hidden="true"><span /></div>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-preview-section">
          <div className="preview-section-heading">
            <div>
              <p className="landing-eyebrow">THE WORKFLOW IS THE INTERFACE</p>
              <h2>See the steps. Inspect the result.</h2>
            </div>
            <p>
              The canvas illustration below reflects node types and result details supported by the current prototype.
              It is a design preview, not a screenshot of the running app.
            </p>
          </div>
          <WorkflowPreview />
        </section>

        <section className="landing-section landing-about" id="about">
          <div className="about-heading">
            <p className="landing-eyebrow">ABOUT THE PROJECT</p>
            <h2>Making data exploration more visual and accessible.</h2>
          </div>
          <div className="about-copy">
            <p>
              This platform aims to simplify the data profiling and analytics process through an interactive visual
              workflow environment. By combining node-based interaction with automated data analysis, it provides
              users with a structured and accessible way to explore, process, and understand datasets.
            </p>
            <p>
              The current prototype focuses on tabular data, profiling, transformation, and retail-oriented analysis.
              Its connected canvas makes the order and purpose of each operation easier to follow.
            </p>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta-copy">
            <p className="landing-eyebrow">START WITH A WORKFLOW</p>
            <h2>Ready to explore your data?</h2>
            <p>Build a visual flow, inspect your rows, and turn a dataset into a result you can use.</p>
          </div>
          <a className="landing-button landing-button-primary" href="/app">
            Launch platform <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <a className="landing-brand landing-footer-brand" href="#top" aria-label="DataFlow home">
            <BrandMark small />
            <span className="landing-brand-name">DataFlow<span>VISUAL ANALYTICS</span></span>
          </a>
          <p>Visual workflows for profiling, processing, and understanding tabular data.</p>
          <nav className="landing-footer-links" aria-label="Footer navigation">
            {navigation.slice(1).map(({ label, href }) => (
              <a href={href} key={href}>{label}</a>
            ))}
            <a href="/app">Launch platform</a>
          </nav>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} DataFlow · Group 18 major project</span>
          <span>Interactive Node-Based Data Profiling &amp; Analytics Platform</span>
        </div>
      </footer>
    </div>
  );
}
