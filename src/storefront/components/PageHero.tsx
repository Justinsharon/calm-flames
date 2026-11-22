import React from 'react';
import { Link } from 'react-router';
import { usePointerParallax } from '../hooks/useMotion';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Full-bleed hero: photo with slow drift + pointer parallax, fade to ink, crumb, eyebrow,
 * serif title with one script word, one-line sub. Without a photo, a plain wine glow is used.
 */
export const PageHero: React.FC<{
  image?: string;
  crumbs?: Crumb[];
  eyebrow?: string;
  title: React.ReactNode;
  sub?: string;
  minHeight?: number;
  children?: React.ReactNode;
}> = ({ image, crumbs, eyebrow, title, sub, minHeight = 520, children }) => {
  const { ref, pos } = usePointerParallax<HTMLElement>();
  return (
    <section ref={ref} className="hero" style={{ minHeight }}>
      {image ? (
        <div className="hero-media" style={{ transform: `translate3d(${(pos.x * -24).toFixed(1)}px, ${(pos.y * -24).toFixed(1)}px, 0)` }}>
          <img className="drift" src={image} alt="" />
        </div>
      ) : (
        <div className="hero-plain" aria-hidden="true" />
      )}
      <div className="hero-fade" aria-hidden="true" />
      <div className="wrap" style={{ position: 'relative', zIndex: 10, minHeight, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingTop: 120, paddingBottom: 64 }}>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <p className="crumb fade-in" style={{ animationDelay: '.1s' }}>
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' · '}
                  {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                </React.Fragment>
              ))}
            </p>
          </nav>
        )}
        {eyebrow && <p className="eyebrow fade-in" style={{ animationDelay: '.2s' }}>{eyebrow}</p>}
        <h1 className="serif fade-in" style={{ animationDelay: '.35s', margin: 0, fontWeight: 400, fontSize: 'clamp(3rem, 7vw, 104px)', lineHeight: 1 }}>
          {title}
        </h1>
        {sub && (
          <p className="serif fade-in" style={{ animationDelay: '.6s', margin: '18px 0 0', maxWidth: 560, fontSize: 22, lineHeight: 1.45, color: 'var(--color-ivory-2)' }}>
            {sub}
          </p>
        )}
        {children}
      </div>
    </section>
  );
};

/** "Before <script>after</script>" helper for hero titles. */
export const HeroTitle: React.FC<{ before?: string; script: string; after?: string }> = ({ before, script, after }) => (
  <>
    {before ? `${before} ` : ''}
    <span className="script" style={{ fontSize: '1.25em', color: 'var(--color-rose)' }}>{script}</span>
    {after ? ` ${after}` : ''}
  </>
);
