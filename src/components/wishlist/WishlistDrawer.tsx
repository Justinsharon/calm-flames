import React from 'react';
import { X, Heart, ShoppingBag, ArrowRight, Trash2 } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { Product } from '../../types';

interface WishlistDrawerProps {
  onExplore: () => void;
  onSelectProduct: (product: Product) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  onExplore,
  onSelectProduct
}) => {
  const { wishlistProducts, isWishlistOpen, setIsWishlistOpen, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();

  if (!isWishlistOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#FAF7F2] border-l border-[#E5DCCE] shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/60">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#D18D4D] fill-current" />
              <h3 className="text-base font-serif font-bold text-[#1F1B18] tracking-tight">
                Saved Rituals ({wishlistProducts.length})
              </h3>
            </div>
            <button
              onClick={() => setIsWishlistOpen(false)}
              className="p-1 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
              aria-label="Close wishlist"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-[#E5DCCE]/70">
            {wishlistProducts.length > 0 ? (
              wishlistProducts.map((product) => (
                <div key={product.id} className="py-4 flex gap-4 items-center">
                  <div
                    onClick={() => {
                      setIsWishlistOpen(false);
                      onSelectProduct(product);
                    }}
                    className="w-16 h-16 rounded-xl overflow-hidden bg-[#F2ECE1] border border-[#E5DCCE] shrink-0 cursor-pointer"
                  >
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4
                        onClick={() => {
                          setIsWishlistOpen(false);
                          onSelectProduct(product);
                        }}
                        className="text-sm font-serif font-bold text-[#1F1B18] truncate cursor-pointer hover:text-[#9E6D47] transition-colors"
                      >
                        {product.name}
                      </h4>
                      <span className="text-xs font-semibold text-[#1F1B18] font-sans">
                        {product.priceStatus !== 'missing' && product.price > 0
                          ? `₹${product.price}`
                          : 'Price Pending'}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#79716B]">
                      {product.scentFamily}{product.burnTime ? ` · ${product.burnTime}` : ''}
                    </p>

                    <div className="pt-2 flex items-center justify-between gap-2">
                      {product.priceStatus !== 'missing' && product.price > 0 ? (
                        <button
                          onClick={() => {
                            addToCart(product, 1);
                          }}
                          className="flex-1 py-1.5 px-3 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-[11px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ShoppingBag className="w-3 h-3 text-[#D18D4D]" />
                          <span>Move to Bag</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setIsWishlistOpen(false);
                            onSelectProduct(product);
                          }}
                          className="flex-1 py-1.5 px-3 bg-[#F2ECE1] text-[#65412E] text-[11px] font-medium rounded-lg border border-[#DBC4A9] text-center"
                        >
                          <span>View Details</span>
                        </button>
                      )}

                      <button
                        onClick={() => toggleWishlist(product.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 transition-colors"
                        aria-label="Remove from wishlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#F2ECE1] border border-[#DBC4A9] flex items-center justify-center text-[#9E6D47]">
                  <Heart className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-serif text-[#1F1B18]">
                    Your wishlist is empty
                  </h4>
                  <p className="text-xs text-[#79716B] max-w-xs mx-auto">
                    Save your favorite candles for later
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsWishlistOpen(false);
                    onExplore();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full transition-colors"
                >
                  <span>Continue Shopping</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
