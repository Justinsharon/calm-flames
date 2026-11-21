import React, { useState } from 'react';
import { X, Gift, Sparkles, ArrowRight, RotateCcw, ShoppingBag } from 'lucide-react';
import { aiService, GiftFinderResponse } from '../../services/aiService';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';

interface SmartGiftFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

const RECIPIENTS = ['Partner', 'Friend', 'Parent', 'Colleague', 'Self', 'Someone special'];
const OCCASIONS = ['Birthday', 'Anniversary', 'Thank you', 'Housewarming', 'Celebration', 'Just because'];
const FEELINGS = ['Calm', 'Warmth', 'Joy', 'Romance', 'Comfort', 'Celebration'];

export const SmartGiftFinderModal: React.FC<SmartGiftFinderModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct
}) => {
  const { addToCart } = useCart();
  const [recipient, setRecipient] = useState(RECIPIENTS[0]);
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [feeling, setFeeling] = useState(FEELINGS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GiftFinderResponse | null>(null);

  if (!isOpen) return null;

  const handleFindGift = async () => {
    setLoading(true);
    try {
      const res = await aiService.findGift(recipient, occasion, feeling);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const matchedProduct = result
    ? products.find((p) => p.id === result.productId) || products[0]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DCCE]">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F1B18]">
              Smart Gift Finder
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          /* Selection Step */
          <div className="space-y-5">
            <div className="space-y-1">
              <h4 className="text-xl font-serif font-bold text-[#1F1B18]">
                Gift moments of intentional calm.
              </h4>
              <p className="text-xs text-[#79716B]">
                Answer 3 quick questions and our curator will match the ideal candle with a personalized sentiment.
              </p>
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1F1B18]">Who are you shopping for?</label>
              <div className="flex flex-wrap gap-1.5">
                {RECIPIENTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecipient(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      recipient === r
                        ? 'bg-[#2A2521] text-white border-[#2A2521]'
                        : 'bg-white text-[#65412E] border-[#DBC4A9] hover:border-[#1F1B18]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Occasion */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1F1B18]">What is the occasion?</label>
              <div className="flex flex-wrap gap-1.5">
                {OCCASIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOccasion(o)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      occasion === o
                        ? 'bg-[#D18D4D] text-white border-[#D18D4D]'
                        : 'bg-white text-[#65412E] border-[#DBC4A9] hover:border-[#D18D4D]'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Feeling */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1F1B18]">What feeling should the gift create?</label>
              <div className="flex flex-wrap gap-1.5">
                {FEELINGS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFeeling(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      feeling === f
                        ? 'bg-[#2A2521] text-white border-[#2A2521]'
                        : 'bg-white text-[#65412E] border-[#DBC4A9]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleFindGift}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[#2A2521] hover:bg-[#4A2F22] disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              {loading ? (
                <span>Curating your gift...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#D18D4D]" />
                  <span>Discover Recommended Gift</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Result Step */
          <div className="space-y-5 animate-in fade-in">
            {matchedProduct && (
              <div className="bg-[#F2ECE1] p-5 rounded-2xl border border-[#DBC4A9] flex gap-4 items-center">
                <img
                  src={matchedProduct.image}
                  alt={matchedProduct.name}
                  className="w-20 h-20 rounded-xl object-cover bg-stone-100 shrink-0"
                />
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#9E6D47]">
                    Curated Gift Match
                  </span>
                  <h4 className="text-lg font-serif font-bold text-[#1F1B18] truncate">
                    {matchedProduct.name}
                  </h4>
                  <p className="text-xs text-[#79716B] line-clamp-1">{matchedProduct.tagline}</p>
                  <span className="text-xs font-bold font-sans text-[#1F1B18]">
                    {matchedProduct.priceStatus !== 'missing' && matchedProduct.price > 0
                      ? `₹${matchedProduct.price}`
                      : 'Price Pending'}
                  </span>
                </div>
              </div>
            )}

            <div className="p-4 bg-white rounded-2xl border border-[#E5DCCE] space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#79716B]">
                Complimentary Gift Card Inscription
              </span>
              <p className="text-xs text-[#4A2F22] italic leading-relaxed">
                "{result.giftMessage}"
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => setResult(null)}
                className="px-4 py-2 text-xs text-[#79716B] hover:text-[#1F1B18] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Adjust</span>
              </button>

              <div className="flex items-center gap-2">
                {matchedProduct && matchedProduct.priceStatus !== 'missing' && matchedProduct.price > 0 && (
                  <button
                    onClick={() => {
                      addToCart(matchedProduct, 1);
                      onClose();
                    }}
                    className="px-4 py-2.5 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-xs font-semibold rounded-xl border border-[#DBC4A9] flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Add to Bag</span>
                  </button>
                )}

                {matchedProduct && (
                  <button
                    onClick={() => {
                      onClose();
                      onSelectProduct(matchedProduct);
                    }}
                    className="px-5 py-2.5 bg-[#2A2521] text-white text-xs font-semibold rounded-xl hover:bg-[#4A2F22]"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
