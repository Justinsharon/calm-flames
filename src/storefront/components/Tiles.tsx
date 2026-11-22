import React from 'react';
import { Link } from 'react-router';
import { MatchAvatar } from './ui';

/** Arch tile (collections). */
export const ArchTile: React.FC<{ to: string; name: string; image?: string; cta?: string }> = ({ to, name, image, cta = 'Explore →' }) => (
  <Link to={to} className="tilt" style={{ borderRadius: '200px 200px 18px 18px' }}>
    <div className="arch">
      {image ? <img src={image} alt="" loading="lazy" /> : <div style={{ height: 340 }} />}
      <div className="arch-fade" aria-hidden="true" />
      <span className="shine" aria-hidden="true" />
    </div>
    <span className="lift" style={{ position: 'absolute', left: 0, right: 0, bottom: 22, textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
      <span className="serif" style={{ fontSize: 24, lineHeight: 1.15 }}>{name}</span>
      {cta && <span style={{ fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-rose)', marginTop: 6 }}>{cta}</span>}
    </span>
  </Link>
);

/** Occasion tile: 3:4 photo, script name. */
export const OccasionTile: React.FC<{ to: string; name: string; image?: string }> = ({ to, name, image }) => (
  <Link to={to} className="tilt occ">
    {image ? <img src={image} alt="" loading="lazy" /> : <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, rgba(123,30,46,.6), transparent 70%)' }} />}
    <span className="occ-fade" aria-hidden="true" />
    <span className="shine" aria-hidden="true" />
    <span className="lift" style={{ position: 'absolute', left: 20, right: 20, bottom: 20, padding: 0 }}>
      <span className="script" style={{ fontSize: 44, display: 'block', lineHeight: 1 }}>{name}</span>
      <span style={{ fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-rose)' }}>Shop gifts →</span>
    </span>
  </Link>
);

/** Scent family chip with round photo. Rendered as a link (or a button when `onClick`). */
export const ScentChip: React.FC<{ to: string; name: string; notes: string[]; image?: string; active?: boolean }> = ({ to, name, notes, image, active }) => (
  <Link to={to} className={`chip-scent glass${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined}>
    {image ? <img className="dot" src={image} alt="" loading="lazy" /> : <span className="dot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MatchAvatar size={40} /></span>}
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
      <span className="serif" style={{ fontSize: 22 }}>{name}</span>
      {notes.length > 0 && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{notes.join(' · ')}</span>}
    </span>
  </Link>
);
