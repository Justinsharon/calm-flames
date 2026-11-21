import React from 'react';
import { Product } from '../../types';
import { Heart, Sparkles, Eye, ShoppingBag } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onQuickView }) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();
  const isFavorited = isInWishlist(product.id);
  const isPurchasable = product.priceStatus !== 'missing' && product.price > 0;

  return (
    <article className="group relative bg-[#FAF7F2] rounded-2xl border border-[#E5DCCE] hover:border-[#D18D4D]/50 hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden">
      {/* Product Image Area (65-70% visual prominence) */}
      <div className="relative aspect-[4/3] w-full bg-[#F2ECE1] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
          loading="lazy"
        />

        {/* Soft bottom vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Scent Family Pill tag (single subtle tag) */}
        <div className="absolute top-3 left-3 bg-[#FAF7F2]/90 backdrop-blur-xs px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-[#65412E] border border-[#E5DCCE]/80">
          {product.subcategory || product.scentFamily}
        </div>

        {/* Wishlist Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWishlist(product.id);
          }}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all duration-200 ${
            isFavorited
              ? 'bg-[#D18D4D] text-white shadow-xs'
              : 'bg-[#FAF7F2]/90 text-[#4A2F22] hover:text-[#D18D4D] hover:bg-white shadow-2xs'
          }`}
          aria-label={isFavorited ? 'Remove from saved rituals' : 'Save ritual to wishlist'}
        >
          <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
        </button>

        {/* Quick View Hover Overlay Button */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 hidden sm:flex gap-2">
          <button
            onClick={() => onQuickView(product)}
            className="flex-1 py-2 px-3 bg-[#FAF7F2]/95 hover:bg-white text-[#1F1B18] text-xs font-medium rounded-lg shadow-sm border border-[#E5DCCE] flex items-center justify-center gap-1.5 backdrop-blur-xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-[#9E6D47]" />
            <span>Specifications & Details</span>
          </button>
        </div>
      </div>

      {/* Product Content */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              onClick={() => onQuickView(product)}
              className="text-lg sm:text-xl font-serif font-bold text-[#1F1B18] hover:text-[#9E6D47] transition-colors cursor-pointer"
            >
              {product.name}
            </h3>
            <span className="text-xs sm:text-sm font-semibold text-[#1F1B18] font-sans shrink-0">
              {isPurchasable ? `₹${product.price}` : 'Price Pending'}
            </span>
          </div>

          {/* Short Scent / Product Descriptor */}
          <p className="text-xs text-[#65412E] line-clamp-2 leading-relaxed">
            {product.shortDescription || product.tagline || `${product.name} crafted by The Calm Flame.`}
          </p>

          {/* Verified Attributes (Weight / Dimensions / Fragrance) */}
          <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[#79716B]">
            {product.weight && (
              <span className="bg-[#F2ECE1] px-2 py-0.5 rounded font-mono">
                {product.weight}
              </span>
            )}
            {product.dimensions && (
              <span className="bg-[#F2ECE1] px-2 py-0.5 rounded font-mono">
                {product.dimensions}
              </span>
            )}
            {product.fragrance && (
              <span className="bg-[#F2ECE1] text-[#9E6D47] px-2 py-0.5 rounded font-medium">
                {product.fragrance}
              </span>
            )}
          </div>
        </div>

        {/* Action Bar for Mobile & Quick Add */}
        <div className="pt-2 border-t border-[#E5DCCE]/60 flex items-center gap-2">
          <button
            onClick={() => onQuickView(product)}
            className="sm:hidden flex-1 py-2 text-xs font-medium text-[#4A2F22] bg-[#F2ECE1] rounded-lg border border-[#DBC4A9] text-center"
          >
            Details
          </button>

          {isPurchasable ? (
            <button
              onClick={() => addToCart(product, 1)}
              className="flex-1 py-2 px-3 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#D18D4D]" />
              <span>Add to Bag</span>
            </button>
          ) : (
            <button
              onClick={() => onQuickView(product)}
              className="flex-1 py-2 px-3 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#65412E] text-xs font-medium rounded-lg border border-[#DBC4A9] text-center transition-colors"
            >
              <span>View Details</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
