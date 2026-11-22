import React from 'react';
import { useDocumentMeta } from '../hooks/useMotion';
import { paths } from '../../lib/routes';
import { ButtonLink, MatchAvatar } from '../components/ui';

export const NotFoundPage: React.FC = () => {
  useDocumentMeta('Page not found', 'This page could not be found.');
  return (
    <section className="wrap" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: 80, paddingBottom: 110, gap: 18 }}>
      <MatchAvatar size={72} />
      <p className="eyebrow" style={{ margin: 0 }}>Error 404</p>
      <h1 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(2.6rem, 6vw, 80px)', lineHeight: 1 }}>
        This flame has <span className="script" style={{ color: 'var(--color-rose)', fontSize: '1.2em' }}>gone out</span>
      </h1>
      <p style={{ color: 'var(--color-muted)', maxWidth: 460, margin: 0 }}>The page you're looking for doesn't exist or has moved.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        <ButtonLink to={paths.home()}>Back to home</ButtonLink>
        <ButtonLink to={paths.scent()} variant="out">Shop by scent</ButtonLink>
      </div>
    </section>
  );
};
