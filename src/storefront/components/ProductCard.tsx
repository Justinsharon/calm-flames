import React from 'react';
import { Link } from 'react-router';
import type { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { canAddToCart, priceLabel, productBadge, productSubtitle } from '../../lib/storefront';
import { paths } from '../../lib/routes';
import { HeartIcon, MatchAvatar } from './ui';

/**
 * Product card: hover swaps to the second photo, glass heart (wishlist), Add to cart slides up
 * (always visible on mobile). Unpriced or out-of-stock products never show Add to cart.
 */
export const ProductCard: React.FC<{ product: Product; familyName?: string }> = ({ product: p, familyName }) => {
  const { addToCart } = useCart();
  const [added, setAdded] = React.useState(false);
  const { toggleWishlist, isInWishlist } = useWishlist();
  const saved = isInWishlist(p.id);
  const badge = productBadge(p);
  const second = p.galleryImages?.[1];
  const subtitle = productSubtitle(p, familyName);
  return (
    <div className="card">
      <Link to={paths.product(p)} className="tilt card-photo" aria-label={p.name}>
        {badge && <span className="badge">{badge}</span>}
        {p.image ? (
          <>
            <img src={p.image} alt={p.name} loading="lazy" />
            {second && <img className="alt" src={second} alt="" loading="lazy" />}
          </>
        ) : (
          <span className="card-noimg" aria-hidden="true">
            <MatchAvatar size={56} />
          </span>
        )}
        <span className="shine" aria-hidden="true" />
      </Link>
      <button
        type="button"
        className={`heart${saved ? ' on' : ''}`}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${p.name} from favourites` : `Save ${p.name} to favourites`}
        onClick={() => toggleWishlist(p.id)}
      >
        <HeartIcon />
      </button>
      <Link to={paths.product(p)} className="serif" style={{ fontSize: 23, textDecoration: 'none', lineHeight: 1.2, marginTop: 6 }}>
        {p.name}
      </Link>
      {subtitle && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{subtitle}</span>}
      <span style={{ fontWeight: 700, letterSpacing: '.02em', color: canAddToCart(p) ? undefined : 'var(--color-muted)' }}>
        {p.inventoryStatus === 'out_of_stock' ? `${priceLabel(p)} · Out of stock` : priceLabel(p)}
      </span>
      {canAddToCart(p) && (
        <button
          type="button"
          className="btn btn-pri card-add"
          onClick={() => {
            if (addToCart(p, 1)) {
              setAdded(true);
              setTimeout(() => setAdded(false), 1800);
            }
          }}
        >
          <span aria-live="polite">{added ? 'Added to cart ✓' : 'Add to cart'}</span>
        </button>
      )}
    </div>
  );
};

export const ProductGrid: React.FC<{ products: Product[]; familyNames?: Record<string, string> }> = ({ products, familyNames = {} }) => (
  <div className="p3 grid-cards">
    {products.map((p) => (
      <ProductCard key={p.id} product={p} familyName={p.scentFamilySlug ? familyNames[p.scentFamilySlug] : undefined} />
    ))}
  </div>
);
