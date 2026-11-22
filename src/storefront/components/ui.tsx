/** Shared storefront primitives (DESIGN.md → Components). */
import React from 'react';
import { Link } from 'react-router';

export const Wordmark: React.FC<{ size?: 'md' | 'lg' }> = ({ size = 'md' }) => (
  <span className="wordmark" aria-hidden={false}>
    <span className="script" style={{ fontSize: size === 'lg' ? 36 : 30 }}>the</span>
    <span className="serif" style={{ fontSize: size === 'lg' ? 34 : 28, fontWeight: 500 }}>Calm</span>
    <span style={{ fontSize: size === 'lg' ? 13 : 11, letterSpacing: '.28em', textTransform: 'uppercase' }}>flame</span>
  </span>
);

/** Serif heading with one script-accent word, as in the wireframe. */
export const Title: React.FC<{
  as?: 'h1' | 'h2' | 'h3';
  before?: string;
  script: string;
  after?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ as: Tag = 'h2', before, script, after, className = 'h-section', style }) => (
  <Tag className={className} style={style}>
    {before ? `${before} ` : ''}
    <span className="script accent">{script}</span>
    {after ? ` ${after}` : ''}
  </Tag>
);

export const SectionHead: React.FC<{
  eyebrow?: string;
  before?: string;
  script: string;
  after?: string;
  center?: boolean;
  action?: React.ReactNode;
}> = ({ eyebrow, before, script, after, center, action }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: center ? 'center' : 'space-between',
      alignItems: 'flex-end',
      gap: 16,
      marginBottom: 44,
      textAlign: center ? 'center' : undefined
    }}
  >
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Title before={before} script={script} after={after} />
    </div>
    {action}
  </div>
);

type BtnProps = { variant?: 'pri' | 'out'; className?: string; style?: React.CSSProperties; children: React.ReactNode };

export const ButtonLink: React.FC<BtnProps & { to: string }> = ({ to, variant = 'pri', className = '', style, children }) => (
  <Link to={to} className={`btn btn-${variant} ${className}`} style={style}>
    {children}
  </Link>
);

export const Button: React.FC<BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ variant = 'pri', className = '', children, type, ...rest }) => (
  <button type={type || 'button'} className={`btn btn-${variant} ${className}`} {...rest}>
    {children}
  </button>
);

export const Accordion: React.FC<{ items: { title: string; content: React.ReactNode; open?: boolean }[] }> = ({ items }) =>
  items.length === 0 ? null : (
    <div className="acc">
      {items.map((it, i) => (
        <details key={it.title} open={it.open ?? i === 0}>
          <summary>{it.title}</summary>
          <div className="body">{it.content}</div>
        </details>
      ))}
    </div>
  );

export const QtyStepper: React.FC<{ value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }> = ({
  value,
  onChange,
  min = 1,
  max = 100,
  label
}) => (
  <div className="qty" role="group" aria-label={label}>
    <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
      −
    </button>
    <output aria-live="polite">{value}</output>
    <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
      +
    </button>
  </div>
);

/** Mini matchstick avatar (replaces flame icons; gift guide). */
export const MatchAvatar: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <span className="match-av" aria-hidden="true" style={{ width: size, height: size, borderRadius: size / 2 }}>
    <span className="mm-stick" />
    <span className="mm-head" />
    <span className="mm-flame" />
  </span>
);

export const HeartIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
  </svg>
);

export const PersonIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
  </svg>
);

/** Round outlined icon used in the trust strip and support topics. */
export const RingIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{ width: 48, height: 48, flex: 'none', borderRadius: 24, border: '1px solid rgba(244,237,231,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EBC9BF" strokeWidth="1.5" aria-hidden="true">
      {children}
    </svg>
  </span>
);

/** Empty state used when a page has no published data yet (never sample content). */
export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="glass" style={{ padding: '28px 32px', color: 'var(--color-muted)', margin: 0, textAlign: 'center' }}>
    {children}
  </p>
);
