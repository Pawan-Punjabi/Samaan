import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import './Navbar.css';

export function LogoMark() {
  return (
    <span className="df-mark" aria-hidden="true">
      <svg viewBox="0 0 34 34" fill="none">
        <path d="m8 11 17-3M9 13l5 10m2 1 8-14" />
        <circle cx="7.5" cy="11.5" r="3.5" />
        <circle cx="27" cy="7.5" r="3.5" />
        <circle cx="15" cy="25" r="3.5" />
      </svg>
    </span>
  );
}

export default function Navbar({ mode = 'landing', rightContent = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isStudio = mode === 'studio';

  const navLinks = [
    { label: 'Home', href: isStudio ? '/' : '#top', active: !isStudio },
    { label: 'Features', href: isStudio ? '/#features' : '#features', active: false },
    { label: 'How it works', href: isStudio ? '/#how-it-works' : '#how-it-works', active: false },
    { label: 'About', href: isStudio ? '/#about' : '#about', active: false },
    { label: 'Studio', href: '/app', active: isStudio },
  ];

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`df-nav no-print${isStudio ? ' df-nav-studio' : ''}`}>
      <div className="df-nav-inner">
        <a
          className="df-brand"
          href={isStudio ? '/' : '#top'}
          onClick={closeMenu}
          aria-label="Samaan home"
        >
          <LogoMark />
          <span>
            Samaan<small>RETAIL ANALYTICS</small>
          </span>
        </a>

        <button
          className="df-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="df-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav
          id="df-navigation"
          className={menuOpen ? 'df-links df-links-open' : 'df-links'}
          aria-label="Main navigation"
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={closeMenu}
              className={link.active ? 'df-link-active' : undefined}
              aria-current={link.active ? 'page' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="df-nav-actions">
          {rightContent || (
            <a className="df-nav-cta" href="/app">
              Launch App <ArrowUpRight size={15} />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
