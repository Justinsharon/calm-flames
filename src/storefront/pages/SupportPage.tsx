import React, { useState } from 'react';
import { Link } from 'react-router';
import { paths } from '../../lib/routes';
import { splitFaq, SPECIAL_PAGE_SLUGS } from '../../lib/pages';
import { Markdown } from '../../lib/markdown';
import { useDocumentMeta } from '../hooks/useMotion';
import { usePage } from '../hooks/usePages';
import { PageHero, HeroTitle } from '../components/PageHero';
import { Accordion, Button, RingIcon, SectionHead } from '../components/ui';

/**
 * Help & Support layout. FAQ and contact details come from the owner's published `pages/faq` and
 * `pages/contact`; the search filters the FAQ. Order tracking and the call-back form are laid out
 * but not connected yet (Phase 4D), and say so.
 */
export const SupportPage: React.FC = () => {
  useDocumentMeta('Help & Support', 'Track an order, find answers, or talk to our studio.');
  const { page: faqPage } = usePage(SPECIAL_PAGE_SLUGS.faq);
  const { page: contact } = usePage(SPECIAL_PAGE_SLUGS.contact);
  const [q, setQ] = useState('');
  const faq = faqPage ? splitFaq(faqPage.body) : [];
  const needle = q.trim().toLowerCase();
  const shownFaq = needle ? faq.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(needle)) : faq;

  const topics = [
    { to: '#track', title: 'Track my order', sub: 'Where is my parcel?', icon: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></> },
    { to: paths.info('shipping'), title: 'Shipping', sub: 'Delivery times and charges', icon: <><path d="M3 12h13M12 6l6 6-6 6" /></> },
    { to: paths.info('returns'), title: 'Returns', sub: 'How returns and refunds work', icon: <><path d="M4 12a8 8 0 0114-5" /><path d="M18 3v4h-4" /><path d="M20 12a8 8 0 01-14 5" /><path d="M6 21v-4h4" /></> },
    { to: paths.info('corporate'), title: 'Corporate gifting', sub: 'Gifts for your team', icon: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 8v12M3 12h18" /></> }
  ];

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: paths.home() }, { label: 'Help & Support' }]}
        eyebrow="We're here to help"
        title={<HeroTitle before="Help &" script="support" />}
        sub="Track an order, find an answer, or talk to a real person in our studio."
      >
        {faq.length > 0 && (
          <form role="search" onSubmit={(e) => e.preventDefault()} className="glass fade-in" style={{ animationDelay: '.8s', marginTop: 28, maxWidth: 620, display: 'flex', gap: 8, padding: '8px 8px 8px 20px', borderRadius: 999, alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EBC9BF" strokeWidth="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input className="in" type="search" aria-label="Search help" placeholder="Search the questions below" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'transparent', minHeight: 44 }} />
          </form>
        )}
      </PageHero>

      <section className="wrap" style={{ paddingTop: 64 }}>
        <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {topics.map((t) => {
            const inner = (<><RingIcon>{t.icon}</RingIcon><span className="serif" style={{ fontSize: 22, lineHeight: 1.2 }}>{t.title}</span><span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{t.sub}</span></>);
            const style: React.CSSProperties = { padding: '26px 22px', borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 10 };
            return t.to.startsWith('#') ? (
              <a key={t.title} href={t.to} className="glass tilt" style={style}>{inner}</a>
            ) : (
              <Link key={t.title} to={t.to} className="glass tilt" style={style}>{inner}</Link>
            );
          })}
        </div>
      </section>

      <section id="track" className="wrap" style={{ paddingTop: 90, paddingBottom: 90 }}>
        <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 48, padding: 'clamp(28px, 4vw, 52px)', background: 'linear-gradient(135deg, rgba(123,30,46,.5), rgba(92,22,34,.2))' }}>
          <form onSubmit={(e) => e.preventDefault()} style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Order status</p>
            <h2 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 48, lineHeight: 1.05 }}>Track your <span className="script" style={{ color: 'var(--color-rose)', fontSize: '1.2em' }}>order</span></h2>
            <label className="lab">Order number<input className="in" name="order" autoComplete="off" placeholder="TCF-" /></label>
            <label className="lab">Phone number<input className="in" type="tel" name="phone" autoComplete="tel" placeholder="+91" /></label>
            <div><Button type="submit" disabled aria-describedby="track-note">Track order</Button></div>
          </form>
          <div id="track-note" style={{ flex: '1 1 320px', minWidth: 0, minHeight: 220, border: '1px dashed rgba(244,237,231,.22)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, color: 'var(--color-taupe)' }}>
            Online order tracking opens soon.
          </div>
        </div>
      </section>

      {faq.length > 0 && (
        <section style={{ background: 'var(--color-ink-2)' }}>
          <div className="wrap" style={{ paddingTop: 100, paddingBottom: 100, display: 'flex', flexWrap: 'wrap', gap: 56 }}>
            <div style={{ flex: '1 1 300px' }}>
              <SectionHead eyebrow="FAQ" before="Common" script="questions" />
            </div>
            <div style={{ flex: '2 1 520px', minWidth: 0 }}>
              {shownFaq.length ? (
                <Accordion items={shownFaq.map((f, i) => ({ title: f.question, content: <Markdown source={f.answer} />, open: i === 0 }))} />
              ) : (
                <p style={{ color: 'var(--color-muted)' }} role="status">No questions match “{q}”.</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="wrap" style={{ paddingTop: 100, paddingBottom: 110 }}>
        <SectionHead center eyebrow="Contact" before="Talk to" script="us" />
        {contact && (
          <div className="glass" style={{ padding: 'clamp(26px, 3.5vw, 40px)', maxWidth: 920, margin: '0 auto 40px' }}>
            <Markdown source={contact.body} />
          </div>
        )}
        <form onSubmit={(e) => e.preventDefault()} className="glass" style={{ padding: 'clamp(28px, 4vw, 48px)', maxWidth: 920, margin: '0 auto' }}>
          <h3 className="serif" style={{ margin: '0 0 22px', fontWeight: 400, fontSize: 34 }}>Request a <span className="script" style={{ color: 'var(--color-rose)' }}>call back</span></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <label className="lab">Name<input className="in" name="name" autoComplete="name" /></label>
            <label className="lab">Phone<input className="in" type="tel" name="phone" autoComplete="tel" placeholder="+91" /></label>
            <label className="lab">Order number (optional)<input className="in" name="order" placeholder="TCF-" /></label>
            <label className="lab">Topic
              <select className="in" name="topic" defaultValue="order">
                <option value="order">Order &amp; delivery</option>
                <option value="damaged">Damaged item</option>
                <option value="returns">Returns &amp; refunds</option>
                <option value="corporate">Corporate gifting</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label className="lab" style={{ gridColumn: '1 / -1' }}>How can we help?<textarea className="in" rows={4} name="message" /></label>
            <label className="lab" style={{ gridColumn: '1 / -1' }}>Photo (for damaged items)<input className="in" type="file" accept="image/*" style={{ paddingTop: 12 }} /></label>
          </div>
          <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <Button type="submit" disabled aria-describedby="callback-note">Send request</Button>
            <span id="callback-note" style={{ fontSize: 13, color: 'var(--color-taupe)' }}>Call-back requests open soon.</span>
          </div>
        </form>
      </section>
    </>
  );
};
