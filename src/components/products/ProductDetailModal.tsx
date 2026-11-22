import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { X, Heart, ShoppingBag, Flame, Sparkles, Check, Clock, ShieldCheck, Leaf, Star, MessageSquare } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import { reviewsService, ProductReview } from '../../services/reviewsService';
import { rewardsService } from '../../services/rewardsService';
import { RitualGeneratorModal } from '../rituals/RitualGeneratorModal';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose
}) => {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isRitualGenOpen, setIsRitualGenOpen] = useState(false);

  // Review submission state
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const { addToCart } = useCart();
  const { shipping } = useStoreSettings();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { user, profile, setIsAuthModalOpen } = useAuth();

  useEffect(() => {
    if (product) {
      reviewsService.getReviewsForProduct(product.id).then((r) => setReviews(r));
    }
  }, [product]);

  if (!product) return null;

  const isFavorited = isInWishlist(product.id);
  const images = (product.galleryImages && product.galleryImages.length > 0) ? product.galleryImages : [product.image];

  const handleAddToCart = () => {
    addToCart(product, quantity);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!reviewBody.trim()) return;

    await reviewsService.submitReview({
      productId: product.id,
      customerId: user.uid,
      customerName: profile?.fullName || 'Verified Customer',
      rating: reviewRating,
      title: reviewTitle || 'Mindful Reflection',
      body: reviewBody,
      isVerified: true
    });

    // Award 30 Calm points for contributing a review
    await rewardsService.awardPoints(user.uid, 30, `Review for ${product.name}`);

    setReviewSubmitted(true);
    reviewsService.getReviewsForProduct(product.id).then((r) => setReviews(r));
    setTimeout(() => {
      setIsWritingReview(false);
      setReviewSubmitted(false);
    }, 2500);
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '5.0';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Top Bar */}
          <div className="px-6 py-3.5 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/60">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-semibold text-[#9E6D47]">
                {product.scentFamily} Collection
              </span>
              <span className="text-stone-300">·</span>
              <div className="flex items-center gap-1 text-xs text-[#1F1B18]">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                <span className="font-semibold font-sans">{avgRating}</span>
                <span className="text-stone-400">({reviews.length} reviews)</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
              aria-label="Close product view"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="overflow-y-auto p-6 sm:p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              {/* Gallery Left Column */}
              <div className="md:col-span-6 space-y-3">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#F2ECE1] border border-[#E5DCCE]">
                  <img
                    src={images[selectedImageIdx] || product.image}
                    alt={product.name}
                    className="w-full h-full object-cover object-center transition-all duration-300"
                  />
                  <button
                    onClick={() => toggleWishlist(product.id)}
                    className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur-md transition-all ${
                      isFavorited
                        ? 'bg-[#D18D4D] text-white'
                        : 'bg-[#FAF7F2]/90 text-[#4A2F22] hover:text-[#D18D4D]'
                    }`}
                    aria-label="Toggle wishlist"
                  >
                    <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
                  </button>
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImageIdx(idx)}
                        className={`relative w-16 h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                          selectedImageIdx === idx
                            ? 'border-[#D18D4D] ring-2 ring-[#D18D4D]/20'
                            : 'border-[#E5DCCE] opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Candle Care Guide */}
                <div className="bg-[#F2ECE1]/50 p-4 rounded-xl border border-[#E5DCCE] text-xs text-[#65412E] space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18]">
                    <Flame className="w-4 h-4 text-[#D18D4D]" />
                    <span>Mindful Candle Care</span>
                  </div>
                  <p><strong>First Burn:</strong> Allow wax to melt evenly across the surface (2-3 hours) to prevent tunneling.</p>
                  <p><strong>Trim the Wick:</strong> Trim wick to 5mm before lighting for an even, steady flame.</p>
                  <p><strong>Safety:</strong> Burn within sight on a heat-resistant surface away from drafts.</p>
                </div>
              </div>

              {/* Product Details Right Column */}
              <div className="md:col-span-6 space-y-6">
                <div className="space-y-2">
                  {product.tagline && (
                    <p className="text-xs sm:text-sm font-serif italic text-[#9E6D47] font-medium leading-relaxed">
                      "{product.tagline}"
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-2xl sm:text-3xl font-serif font-bold text-[#1F1B18] tracking-tight">
                      {product.name}
                    </h3>
                    <div className="text-right">
                      <span className="text-xl sm:text-2xl font-semibold text-[#1F1B18] font-sans">
                        {product.priceStatus !== 'missing' && product.price > 0
                          ? `₹${product.price}`
                          : 'Price Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Verified Product Specifications Chips */}
                <div className="p-4 bg-[#F2ECE1]/60 rounded-2xl border border-[#E5DCCE] space-y-2">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#79716B] block">
                    Verified Specifications
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#4A2F22]">
                    {product.primaryCategory && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Category</span>
                        <span className="font-semibold">{product.primaryCategory}</span>
                      </div>
                    )}
                    {product.subcategory && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Subcategory</span>
                        <span className="font-semibold">{product.subcategory}</span>
                      </div>
                    )}
                    {product.weight && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Weight</span>
                        <span className="font-semibold font-mono">{product.weight}</span>
                      </div>
                    )}
                    {product.dimensions && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Dimensions</span>
                        <span className="font-semibold font-mono">{product.dimensions}</span>
                      </div>
                    )}
                    {product.fragrance && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Fragrance</span>
                        <span className="font-semibold text-[#9E6D47]">{product.fragrance}</span>
                      </div>
                    )}
                    {product.burnTime && (
                      <div>
                        <span className="text-[#79716B] text-[11px] block">Burn Time</span>
                        <span className="font-semibold">{product.burnTime}</span>
                      </div>
                    )}
                    {product.customisation && (
                      <div className="col-span-2 pt-1 border-t border-[#E5DCCE]/60 text-[11px] text-[#79716B]">
                        <span>Customisation: </span>
                        <strong className="text-[#1F1B18]">{product.customisation}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mood Tags */}
                {product.howItFeels && product.howItFeels.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-[#79716B]">
                      How It Feels
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {product.howItFeels.map((feel) => (
                        <span
                          key={feel}
                          className="px-3 py-1 bg-[#F2ECE1] text-[#4A2F22] rounded-full text-xs font-medium border border-[#DBC4A9]"
                        >
                          {feel}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fragrance Journey - Only if verified scent notes exist */}
                {product.scentNotes &&
                  (((product.scentNotes.top?.length ?? 0) > 0) ||
                    ((product.scentNotes.heart?.length ?? 0) > 0) ||
                    ((product.scentNotes.base?.length ?? 0) > 0)) && (
                    <div className="p-4 bg-[#F2ECE1]/70 rounded-2xl border border-[#E5DCCE] space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                        <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                        <span>The Fragrance Journey</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E5DCCE]/70">
                          <span className="text-[10px] uppercase font-semibold text-[#9E6D47] block mb-1">Top</span>
                          <p className="text-[11px] text-[#4A2F22] leading-tight font-medium">
                            {product.scentNotes.top?.join(', ') || 'Botanicals'}
                          </p>
                        </div>
                        <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E5DCCE]/70">
                          <span className="text-[10px] uppercase font-semibold text-[#9E6D47] block mb-1">Heart</span>
                          <p className="text-[11px] text-[#4A2F22] leading-tight font-medium">
                            {product.scentNotes.heart?.join(', ') || 'Warm flora'}
                          </p>
                        </div>
                        <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E5DCCE]/70">
                          <span className="text-[10px] uppercase font-semibold text-[#9E6D47] block mb-1">Base</span>
                          <p className="text-[11px] text-[#4A2F22] leading-tight font-medium">
                            {product.scentNotes.base?.join(', ') || 'Natural soy'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* AI Custom Ritual Button */}
                <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#DBC4A9] flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-[#1F1B18] uppercase tracking-wider">
                      AI Mindful Ritual Generator
                    </h4>
                    <p className="text-[11px] text-[#79716B]">
                      Design a custom 5, 10, or 20-minute pause for this piece.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsRitualGenOpen(true)}
                    className="px-3.5 py-2 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Create My Ritual</span>
                  </button>
                </div>

                {/* Purchase Controls */}
                <div className="pt-2 space-y-3 border-t border-[#E5DCCE]">
                  <div className="flex items-center justify-between text-xs text-[#79716B]">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Hand-Poured Soy Craft
                    </span>
                    {shipping && <span>Free Shipping over ₹{shipping.freeShippingThreshold.toLocaleString('en-IN')}</span>}
                  </div>

                  {product.priceStatus !== 'missing' && product.price > 0 ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-[#DBC4A9] rounded-xl bg-[#F2ECE1] p-1">
                        <button
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 flex items-center justify-center text-[#4A2F22] hover:bg-[#FAF7F2] rounded-lg text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-semibold text-[#1F1B18] font-sans">
                          {quantity}
                        </span>
                        <button
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-8 h-8 flex items-center justify-center text-[#4A2F22] hover:bg-[#FAF7F2] rounded-lg text-sm font-bold"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={handleAddToCart}
                        className="flex-1 py-3 px-6 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <ShoppingBag className="w-4 h-4 text-[#D18D4D]" />
                        <span>Add to Bag · ₹{product.price * quantity}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#F2ECE1] rounded-xl border border-[#DBC4A9] text-center space-y-1">
                      <p className="text-xs font-semibold text-[#1F1B18]">
                        Retail Price Pending · Launching Soon
                      </p>
                      <p className="text-[11px] text-[#79716B]">
                        Retail pricing will be active upon collection release. Customisation and bulk orders can be submitted via Corporate Gifting or our Concierge.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Verified Reviews Section */}
            <div className="pt-6 border-t border-[#E5DCCE] space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xl font-serif font-bold text-[#1F1B18]">
                    Verified Customer Reflections
                  </h4>
                  <p className="text-xs text-[#79716B]">
                    Customer thoughts and reviews.
                  </p>
                </div>

                {!isWritingReview && (
                  <button
                    onClick={() => {
                      if (!user) setIsAuthModalOpen(true);
                      else setIsWritingReview(true);
                    }}
                    className="px-4 py-2 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-xs font-semibold rounded-xl border border-[#DBC4A9] transition-colors"
                  >
                    Share a Reflection (+30 pts)
                  </button>
                )}
              </div>

              {/* Review Writing Form */}
              {isWritingReview && (
                <form onSubmit={handleSubmitReview} className="bg-[#F2ECE1]/60 p-5 rounded-2xl border border-[#DBC4A9] space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[#1F1B18]">Write Your Reflection</span>
                    <button type="button" onClick={() => setIsWritingReview(false)} className="text-xs text-stone-500">
                      Cancel
                    </button>
                  </div>

                  {reviewSubmitted ? (
                    <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Thank you! Your reflection was submitted and 30 Calm Points were awarded.</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#79716B]">Rating:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setReviewRating(s)}
                              className="p-0.5"
                            >
                              <Star className={`w-4 h-4 ${s <= reviewRating ? 'text-amber-500 fill-current' : 'text-stone-300'}`} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        placeholder="Headline for your reflection"
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#DBC4A9] bg-white text-[#1F1B18]"
                      />

                      <textarea
                        value={reviewBody}
                        onChange={(e) => setReviewBody(e.target.value)}
                        required
                        rows={3}
                        placeholder="How did this candle transform your evening or space?"
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#DBC4A9] bg-white text-[#1F1B18]"
                      />

                      <button
                        type="submit"
                        className="px-5 py-2 bg-[#2A2521] text-white text-xs font-semibold rounded-xl hover:bg-[#4A2F22]"
                      >
                        Submit Reflection
                      </button>
                    </>
                  )}
                </form>
              )}

              {/* Reviews List */}
              <div className="space-y-3">
                {reviews.map((rev) => (
                  <div key={rev.id} className="p-4 bg-white rounded-2xl border border-[#E5DCCE] space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[#1F1B18]">{rev.customerName}</span>
                        {rev.isVerified && (
                          <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                            Verified Purchase
                          </span>
                        )}
                      </div>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-3 h-3 ${s <= rev.rating ? 'text-amber-500 fill-current' : 'text-stone-200'}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-[#1F1B18]">{rev.title}</p>
                    <p className="text-xs text-[#65412E] leading-relaxed">{rev.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Ritual Generator Modal */}
      <RitualGeneratorModal
        product={product}
        isOpen={isRitualGenOpen}
        onClose={() => setIsRitualGenOpen(false)}
      />
    </>
  );
};
