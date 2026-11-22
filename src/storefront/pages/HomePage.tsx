import React, { useState } from 'react';
import { Link } from 'react-router';
import { useCatalog } from '../../context/CatalogContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import {
  commonNotes,
  forOccasion,
  inCollection,
  inScentFamily,
  tileImage,
  withProducts,
  withTag
} from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { HERO_ASSET } from '../../data/siteContent';
import { useDocumentMeta, usePointerParallax } from '../hooks/useMotion';
import { usePage, usePublishedPages } from '../hooks/usePages';
import { ArchTile, OccasionTile, ScentChip } from '../components/Tiles';
import { ProductGrid } from '../components/ProductCard';
import { ButtonLink, RingIcon, SectionHead, Title } from '../components/ui';

/** Home: Hero → trust strip → Collections → Bestsellers → Build a Box → Shop by Scent → Gifting →
 *  Our story → Reviews (hidden: no review source yet) → Journal → Join the Ritual. */
export const HomePage: React.FC = () => {
  useDocumentMeta(undefined, undefined);
  const { products } = useCatalog();
  const { collections, scentFamilies, occasions } = useTaxonomy();
  const { cod, buildABox } = useStoreSettings();
  const { pages: stories } = usePublishedPages('journal');
  const { page: returnsPage } = usePage('returns');
  const { page: storyPage } = usePage('our-story');
  const hero = usePointerParallax<HTMLElement>();
  const tilt = usePointerParallax<HTMLDivElement>();

  const liveCollections = withProducts(collections, products, inCollection);
  const liveFamilies = withProducts(scentFamilies, products, inScentFamily);
  const liveOccasions = withProducts(occasions, products, forOccasion);
  const bestsellers = withTag(products, 'bestseller').slice(0, 8);
  const botanicals = commonNotes(products, 8);
  const boxProducts = products.filter((p) => p.boxEligible && p.image).slice(0, 3);
  const familyNames = Object.fromEntries(scentFamilies.map((f) => [f.slug, f.name]));
  const shopLink = liveCollections[0] ? paths.collection(liveCollections[0].slug) : paths.scent();
  const tiltStyle = { transform: `translate3d(${(tilt.pos.x * 14).toFixed(1)}px,0,0) rotateY(${(tilt.pos.x * 3).toFixed(2)}deg) rotateX(${(tilt.pos.y * -2).toFixed(2)}deg)`, transition: 'transform 1s var(--ease-soft)' };

  const trust = [
    { title: 'Handmade', sub: 'Poured in small batches', icon: <><path d="M12 3c2 3 4 4.5 4 8a4 4 0 01-8 0c0-3.5 2-5 4-8z" /><path d="M12 15v6" /></> },
    { title: 'Natural wax', sub: 'Pure botanical oils', icon: <><path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19z" /><path d="M5 19l8-8" /></> },
    ...(cod ? [{ title: 'Cash on delivery', sub: 'Or UPI, cards, netbanking', icon: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 11h18" /></> }] : []),
    ...(returnsPage ? [{ title: 'Easy returns', sub: 'See our returns policy', to: paths.info('returns'), icon: <><path d="M4 12a8 8 0 0114-5" /><path d="M18 3v4h-4" /><path d="M20 12a8 8 0 01-14 5" /><path d="M6 21v-4h4" /></> }] : [])
  ];

  return (
    <>
      {/* Hero */}
      <section ref={hero.ref} className="hero" style={{ minHeight: 'min(920px, 100svh)' }} aria-label="Welcome">
        <div className="hero-media" style={{ transform: `translate3d(${(hero.pos.x * -30).toFixed(1)}px, ${(hero.pos.y * -30).toFixed(1)}px, 0)` }}>
          <img className="drift" src={HERO_ASSET} alt="" style={{ objectPosition: '50% 40%' }} />
        </div>
        <div className="hero-fade" aria-hidden="true" style={{ background: 'linear-gradient(180deg, rgba(30,11,15,.25) 0%, rgba(30,11,15,0) 22%, rgba(30,11,15,0) 55%, rgba(30,11,15,.45) 75%, rgba(30,11,15,1) 100%)' }} />
        <div className="wrap" style={{ position: 'relative', zIndex: 10, minHeight: 'min(920px, 100svh)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingTop: 150, paddingBottom: 200 }}>
          <p className="eyebrow fade-in" style={{ animationDelay: '.2s', marginBottom: 8 }}>Hand-poured in India · Natural wax · Pure botanicals</p>
          <h1 aria-label="Light. Breathe. Be." className="script" style={{ margin: 0, fontSize: 'clamp(4.2rem, 13vw, 210px)', lineHeight: 0.95, textShadow: '0 6px 40px rgba(30,11,15,.45)' }}>
            {['Light.', 'Breathe.', 'Be.'].map((w, i) => (
              <React.Fragment key={w}>
                <span className="word" aria-hidden="true" style={{ animationDelay: `${(0.35 + i * 0.22).toFixed(2)}s` }}>{w}</span>{' '}
              </React.Fragment>
            ))}
          </h1>
          <div className="fade-in" style={{ animationDelay: '1.1s', display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28 }}>
            <p className="serif" style={{ margin: 0, maxWidth: 440, fontSize: 24, lineHeight: 1.4, color: 'var(--color-ivory-2)' }}>
              Candles that slow an evening down, poured by hand in small batches.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <ButtonLink to={shopLink}>Shop the collections</ButtonLink>
              <ButtonLink to={paths.scent()} variant="out">Find your scent</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Why The Calm Flame" className="wrap" style={{ position: 'relative', zIndex: 15, marginTop: -130, perspective: 1000 }}>
        <div ref={tilt.ref} className="glass" style={{ background: 'rgba(92,22,34,.34)', boxShadow: '0 30px 80px rgba(0,0,0,.4)', overflow: 'hidden', ...tiltStyle }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, padding: '32px 36px' }}>
            {trust.map((t) => {
              const inner = (
                <>
                  <RingIcon>{t.icon}</RingIcon>
                  <span style={{ fontSize: 14 }}>
                    <strong style={{ display: 'block', fontSize: 15 }}>{t.title}</strong>
                    <span style={{ color: 'var(--color-muted)' }}>{t.sub}</span>
                  </span>
                </>
              );
              return 'to' in t && t.to ? (
                <Link key={t.title} to={t.to} style={{ display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none' }}>{inner}</Link>
              ) : (
                <div key={t.title} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>{inner}</div>
              );
            })}
          </div>
          {botanicals.length >= 3 && (
            <div className="marquee" aria-label={`Our botanicals: ${botanicals.join(', ')}`}>
              <div className="marquee-track" aria-hidden="true">
                {[...botanicals, ...botanicals].map((b, i) => (
                  <span key={i} style={{ padding: '0 30px', fontSize: 12, fontWeight: 700, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(244,237,231,.6)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 30 }}>
                    {b}<span style={{ color: 'var(--color-taupe)' }}>✦</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Collections */}
      {liveCollections.length > 0 && (
        <section className="wrap" style={{ paddingTop: 120, paddingBottom: 100 }}>
          <SectionHead center eyebrow="Shop by collection" before="Our" script="Collections" />
          <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 26 }}>
            {liveCollections.map((c) => (
              <ArchTile key={c.slug} to={paths.collection(c.slug)} name={c.name} image={tileImage(c, inCollection(products, c.slug))} />
            ))}
          </div>
        </section>
      )}

      {/* Bestsellers */}
      {bestsellers.length > 0 && (
        <section className="wrap" style={{ paddingTop: liveCollections.length ? 0 : 120, paddingBottom: 110 }}>
          <SectionHead eyebrow="Loved by our customers" script="Bestsellers" action={<Link to={shopLink} className="lnk">View all candles →</Link>} />
          <ProductGrid products={bestsellers} familyNames={familyNames} />
        </section>
      )}

      {/* Build a Box: only when the owner has configured it in settings/store */}
      {buildABox && boxProducts.length > 0 && (
        <section className="wrap" style={{ paddingBottom: 110 }}>
          <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 40, padding: 'clamp(28px, 4vw, 56px)', background: 'linear-gradient(135deg, rgba(123,30,46,.55), rgba(92,22,34,.25))' }}>
            <div className="box-stack" aria-hidden="true" style={{ flex: '1 1 420px', minWidth: 0 }}>
              {boxProducts.map((p, i) => <img key={p.id} className={`b${i + 1}`} src={p.image} alt="" />)}
            </div>
            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p className="eyebrow" style={{ margin: 0 }}>Build a Box</p>
              <Title before="The gift," script="made by you" />
              <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                Boxes of {buildABox.sizes.map((s) => s.count).join(', ')} candles. Pick the ones you love; we wrap it.
              </p>
              <div>
                <ButtonLink to={paths.buildBox()}>Build your box</ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Shop by Scent */}
      {liveFamilies.length > 0 && (
        <section style={{ position: 'relative', background: 'var(--color-ink-2)', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', width: 700, height: 700, left: -200, top: -200, background: 'radial-gradient(circle, rgba(123,30,46,.6), rgba(123,30,46,0) 65%)' }} />
          <div className="wrap" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 56, alignItems: 'center', paddingTop: 110, paddingBottom: 110 }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <p className="eyebrow">Shop by scent</p>
              <Title before="Find your" script="scent" style={{ marginBottom: 20 }} />
              <p style={{ color: 'var(--color-muted)', margin: '0 0 30px', maxWidth: 360 }}>Start with how you want the room to feel.</p>
              <ButtonLink to={paths.scent()} variant="out">Explore all scents</ButtonLink>
            </div>
            <div className="p3" style={{ flex: '2 1 560px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
              {liveFamilies.map((f) => {
                const ps = inScentFamily(products, f.slug);
                return <ScentChip key={f.slug} to={paths.scent(f.slug)} name={f.name} notes={commonNotes(ps, 3)} image={tileImage(f, ps)} />;
              })}
            </div>
          </div>
        </section>
      )}

      {/* Gifting */}
      {liveOccasions.length > 0 && (
        <section className="wrap" style={{ paddingTop: 110, paddingBottom: 20 }}>
          <SectionHead center eyebrow="Gifting" before="For every" script="celebration" />
          <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 20 }}>
            {liveOccasions.map((o) => (
              <OccasionTile key={o.slug} to={paths.gifting(o.slug)} name={o.name} image={tileImage(o, forOccasion(products, o.slug))} />
            ))}
          </div>
        </section>
      )}

      {/* Our story */}
      <section className="wrap" style={{ paddingTop: 110, paddingBottom: 60, perspective: 1000 }}>
        <div className="glass" style={{ background: 'rgba(92,22,34,.3)', textAlign: 'center', padding: 'clamp(40px, 6vw, 88px) clamp(24px, 6vw, 96px)', boxShadow: '0 30px 80px rgba(0,0,0,.4)', ...tiltStyle }}>
          <p className="serif" style={{ margin: '0 0 24px', fontStyle: 'italic', fontSize: 20, color: 'rgba(244,237,231,.75)' }}>Our story</p>
          <h2 className="serif" style={{ margin: '0 auto', maxWidth: 1000, fontWeight: 400, fontSize: 'clamp(2.2rem, 4.6vw, 68px)', lineHeight: 1.12 }}>
            Poured by hand with <span className="script" style={{ color: 'var(--color-rose)' }}>mogra</span>,{' '}
            <span className="script" style={{ color: 'var(--color-rose)' }}>sandalwood</span> and{' '}
            <span className="script" style={{ color: 'var(--color-rose)' }}>rose</span>, so every evening can slow to the pace of a <em>flame</em>.
          </h2>
          {storyPage && (
            <div style={{ marginTop: 36 }}>
              <ButtonLink to={paths.info('our-story')} variant="out">Read our story</ButtonLink>
            </div>
          )}
        </div>
      </section>

      {/* Reviews: intentionally not rendered until a real, approved review source exists. */}

      {/* Journal */}
      {stories.length > 0 && (
        <section className="wrap" style={{ paddingTop: 60, paddingBottom: 110 }}>
          <SectionHead before="From the" script="Journal" action={<Link to={paths.journal()} className="lnk">All stories →</Link>} />
          <div className="p3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
            {stories.slice(0, 3).map((s) => (
              <Link key={s.slug} to={paths.journal(s.slug)} className="tilt" style={{ borderRadius: 18 }}>
                <div style={{ overflow: 'hidden', borderRadius: 18, position: 'relative', background: 'var(--color-ink-2)', height: 250 }}>
                  {s.heroImage && <img src={s.heroImage} alt="" loading="lazy" style={{ width: '100%', height: 250, objectFit: 'cover', display: 'block' }} />}
                  <span className="shine" aria-hidden="true" />
                </div>
                {s.category && <span style={{ display: 'block', paddingTop: 16, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{s.category}</span>}
                <span className="serif" style={{ display: 'block', fontSize: 27, lineHeight: 1.2, marginTop: 6 }}>{s.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <JoinTheRitual />
    </>
  );
};

/** Newsletter sign-up, stored server-side (POST /api/newsletter). */
const JoinTheRitual: React.FC = () => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Please try again.');
      setState('done');
    } catch (err: any) {
      setState('error');
      setMsg(err?.message || 'Please try again.');
    }
  };
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--color-ink-2)', marginTop: 50 }}>
      <div aria-hidden="true" style={{ position: 'absolute', width: 800, height: 800, right: -250, top: -300, background: 'radial-gradient(circle, rgba(123,30,46,.6), rgba(123,30,46,0) 65%)' }} />
      <div className="wrap" style={{ position: 'relative', textAlign: 'center', paddingTop: 96, paddingBottom: 96 }}>
        <Title before="Join the" script="Ritual" style={{ marginBottom: 12 }} />
        <p style={{ color: 'var(--color-muted)', margin: '0 0 30px' }}>New scents and festive drops, straight to your inbox.</p>
        {state === 'done' ? (
          <p className="script" role="status" style={{ fontSize: 44, color: 'var(--color-rose)', margin: 0 }}>Thank you</p>
        ) : (
          <form onSubmit={submit} className="glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', alignItems: 'flex-end', maxWidth: 560, margin: '0 auto', padding: 10, borderRadius: 999 }}>
            <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', textAlign: 'left', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-muted)', paddingLeft: 18 }}>
              Email address
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
                style={{ marginTop: 2, minHeight: 36, padding: 0, border: 0, background: 'transparent', color: 'var(--color-ivory)', font: 'inherit', fontSize: 15, letterSpacing: 0, textTransform: 'none', outlineOffset: 4 }} />
            </label>
            <button type="submit" className="btn btn-pri" disabled={state === 'sending'}>{state === 'sending' ? 'Joining…' : 'Subscribe'}</button>
          </form>
        )}
        {state === 'error' && <p role="alert" style={{ color: 'var(--color-rose)', marginTop: 14 }}>{msg}</p>}
      </div>
    </section>
  );
};
