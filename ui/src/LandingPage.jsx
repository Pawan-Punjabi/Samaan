import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  GitMerge,
  MousePointer2,
  Sigma,
} from 'lucide-react';
import Navbar, { LogoMark } from './components/Navbar';
import './LandingPage.css';

const links = [
  { label: 'Home', href: '#top' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'About', href: '#about' },
];

const featureList = [
  {
    title: 'Automated data profiling',
    detail: 'Review inferred column types, nulls, unique values, and row previews at each step.',
    icon: Database,
  },
  {
    title: 'Practical data cleaning',
    detail: 'Trim text, remove duplicates or returns, fill selected nulls, and rename or hide columns.',
    icon: Filter,
  },
  {
    title: 'Filters, formulas, and summaries',
    detail: 'Filter rows, calculate arithmetic formula columns, and group values with common aggregations.',
    icon: Sigma,
  },
  {
    title: 'Retail joins and reorder rules',
    detail: 'Merge sales and stock by SKU, then apply configurable stock and reorder rules.',
    icon: GitMerge,
  },
  {
    title: 'Review and export results',
    detail: 'Search and sort node previews, inspect execution summaries, and export supported results as CSV.',
    icon: Download,
  },
];

const steps = [
  ['01', 'Upload a dataset', 'Import CSV, TSV, Excel, or Parquet files and review the detected columns.'],
  ['02', 'Build your workflow', 'Add processing nodes to the canvas and connect them into a pipeline.'],
  ['03', 'Profile and analyze', 'Run the workflow to inspect previews, column statistics, and step summaries.'],
  ['04', 'Review and export', 'Explore results, then export a node preview or supported retail output.'],
];

function WorkflowIllustration({ preview = false }) {
  return (
    <div className={`df-workflow${preview ? ' df-workflow-preview' : ''}`}>
      {preview && (
        <div className="df-preview-toolbar">
          <span><MousePointer2 size={13} /> Select</span>
          <span><GitMerge size={13} /> Connect</span>
          <span><BarChart3 size={13} /> Auto layout</span>
        </div>
      )}
      <svg className="df-wires" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M264 67 C291 67 310 67 337 67" />
        <path d="M475 87 C500 122 500 170 475 212" />
        <path d="M337 231 C300 231 280 231 264 231" />
      </svg>
      <div className="df-node df-node-source">
        <span className="df-node-icon"><FileSpreadsheet size={16} /></span>
        <span><strong>CSV Input</strong><small>Bring in a table</small></span>
        <i className="df-port df-port-out" />
      </div>
      <div className="df-node df-node-clean">
        <i className="df-port df-port-in" />
        <span className="df-node-icon df-cyan"><Filter size={16} /></span>
        <span><strong>Clean &amp; Dedupe</strong><small>Prepare the rows</small></span>
        <i className="df-port df-port-out" />
      </div>
      <div className="df-node df-node-summary">
        <i className="df-port df-port-in" />
        <span className="df-node-icon"><BarChart3 size={16} /></span>
        <span><strong>Group &amp; Sum</strong><small>Summarize values</small></span>
        <i className="df-port df-port-out" />
      </div>
      <div className="df-node df-node-output">
        <i className="df-port df-port-in" />
        <span className="df-node-icon df-blue"><Download size={16} /></span>
        <span><strong>Action Output</strong><small>Preview or export</small></span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="df-landing" id="top">
      <a className="df-skip" href="#main-content">Skip to content</a>
      <Navbar mode="landing" />

      <main id="main-content">
        <section className="df-hero">
          <div className="df-container df-hero-grid">
            <div className="df-hero-copy">
              <p className="df-eyebrow">INTERACTIVE DATA WORKFLOWS</p>
              <h1>Transform raw data into meaningful insights.</h1>
              <p className="df-intro">
                An interactive node-based data profiling and analytics platform that simplifies data exploration,
                automates profiling workflows, and helps users understand datasets through a visual, connected workspace.
              </p>
              <div className="landing-hero-actions">
                <a className="landing-button landing-button-primary" href="/app">
                  Get started <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a className="landing-button landing-button-secondary" href="#features">
                  Explore features
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="df-section df-features" id="features">
          <div className="df-container">
            <div className="df-section-heading">
              <div><p className="df-eyebrow">A WORKSPACE WITH A CLEAR PURPOSE</p><h2>Make each data step visible.</h2></div>
              <p>Connect supported operations, run them in order, and inspect what each step produces.</p>
            </div>
            <div className="df-feature-layout">
              <article className="df-feature-lead">
                <span className="df-feature-lead-icon"><GitMerge size={19} /></span>
                <h3>Interactive node-based workflow</h3>
                <p>Add steps, connect inputs and outputs, arrange nodes on the canvas, then run a workflow visually.</p>
                <div className="df-mini-flow"><span>Source</span><i /><span>Transform</span><i /><span>Output</span></div>
                <a className="df-inline-link" href="/app">Open the workspace <ArrowUpRight size={14} /></a>
              </article>
              <div className="df-feature-list">
                {featureList.map(({ title, detail, icon: Icon }) => (
                  <article className="df-feature-row" key={title}>
                    <span><Icon size={17} /></span><div><h3>{title}</h3><p>{detail}</p></div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="df-process" id="how-it-works">
          <div className="df-container">
            <div className="df-section-heading">
              <div><p className="df-eyebrow">FROM FILE TO RESULT</p><h2>A straightforward path through your data.</h2></div>
              <p>Each run gives you a closer look at how data moves through the workflow.</p>
            </div>
            <ol className="df-steps">
              {steps.map(([number, title, description]) => (
                <li key={number}>
                  <span className="df-step-number">{number}</span>
                  <span className="df-step-rule" aria-hidden="true" />
                  <h3>{title}</h3><p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="df-section df-preview">
          <div className="df-container">
            <div className="df-section-heading">
              <div><p className="df-eyebrow">THE WORKFLOW IS THE INTERFACE</p><h2>See the steps. Inspect the result.</h2></div>
              <p>This illustration shows supported node types and result details; it is not a screenshot of the prototype.</p>
            </div>
            <div className="df-preview-shell">
              <div className="df-preview-head"><span><LogoMark /> Workflow canvas</span><small>Illustration of supported building blocks</small></div>
              <div className="df-preview-body">
                <WorkflowIllustration preview />
                <aside className="df-inspector">
                  <h3><Database size={15} /> Column profile</h3>
                  <p>Details available in node results</p>
                  <dl><div><dt>Inferred type</dt><dd>Per column</dd></div><div><dt>Null count</dt><dd>Per column</dd></div><div><dt>Unique values</dt><dd>Per column</dd></div><div><dt>Row preview</dt><dd>Per node</dd></div></dl>
                  <div className="df-export-note"><Download size={14} /> Export supported results to CSV</div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section className="df-about df-container" id="about">
          <div><p className="df-eyebrow">ABOUT THE PROJECT</p><h2>Making data exploration more visual and accessible.</h2></div>
          <div>
            <p>This platform aims to simplify data profiling and analytics through an interactive visual workflow environment. By combining node-based interaction with automated data analysis, it provides a structured and accessible way to explore, process, and understand datasets.</p>
            <p>The prototype focuses on tabular data, profiling, transformation, and retail-oriented analysis. Its connected canvas makes the order and purpose of each operation easier to follow.</p>
          </div>
        </section>

        <section className="df-cta df-container">
          <div><p className="df-eyebrow">START WITH A WORKFLOW</p><h2>Ready to explore your data?</h2><p>Build a visual flow, inspect your rows, and turn a dataset into a result you can use.</p></div>
          <a className="df-button df-button-primary" href="/app">Launch platform <ArrowRight size={16} /></a>
        </section>
      </main>

      <footer className="df-footer">
        <div className="df-container df-footer-main">
          <a className="df-brand" href="#top" aria-label="Samaan home"><LogoMark /><span>Samaan<small>RETAIL ANALYTICS</small></span></a>
          <p>Visual workflows for profiling, processing, and understanding tabular data.</p>
          <nav aria-label="Footer navigation">
            {links.slice(1).map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
            <a href="/app">Launch platform</a>
          </nav>
        </div>
        <div className="df-container df-footer-bottom">
          <span>© {new Date().getFullYear()} Samaan · Group 18 major project</span>
          <span>Interactive Node-Based Data Profiling &amp; Analytics Platform</span>
        </div>
      </footer>
    </div>
  );
}
