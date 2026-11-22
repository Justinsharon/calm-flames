import React from 'react';
import { Link } from 'react-router';
import { paths } from '../../lib/routes';
import { Wordmark } from './ui';

export const Footer: React.FC = () => (
  <footer className="site-footer">
    <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, paddingTop: 72, paddingBottom: 48 }}>
      <div>
        <Wordmark size="lg" />
        <p style={{ fontSize: 14, margin: '16px 0 0' }}>Handcrafted candles rooted in India's botanical heritage.</p>
      </div>
      <nav aria-label="Shop">
        <p className="eyebrow">Shop</p>
        <Link to={paths.scent()}>Shop by Scent</Link>
        <Link to={paths.gifting()}>Gifting</Link>
        <Link to={paths.journal()}>Journal</Link>
      </nav>
      <nav aria-label="Help">
        <p className="eyebrow">Help</p>
        <Link to={paths.info('shipping')}>Shipping</Link>
        <Link to={paths.info('returns')}>Returns</Link>
        <Link to={paths.support()}>Help &amp; Support</Link>
      </nav>
      <nav aria-label="About">
        <p className="eyebrow">About</p>
        <Link to={paths.info('our-story')}>Our Story</Link>
        <Link to={paths.info('corporate')}>Corporate gifting</Link>
        <Link to={paths.info('privacy')}>Privacy</Link>
        <Link to={paths.info('terms')}>Terms</Link>
      </nav>
    </div>
    <div className="wrap" style={{ borderTop: '1px solid rgba(244,237,231,.1)', paddingTop: 20, paddingBottom: 28, fontSize: 13 }}>
      © The Calm Flame · Made in India
    </div>
  </footer>
);
