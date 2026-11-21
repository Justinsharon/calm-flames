import React, { useState } from 'react';
import { MOOD_DISCOVERY_ITEMS } from '../../data/siteContent';
import { useCatalog } from '../../context/CatalogContext';
import { MoodKey, Product } from '../../types';
import { getRecommendationForMood } from '../../services/recommendationEngine';
import { Sparkles, ArrowRight, Clock, ShieldCheck, Flame, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';

interface MoodDiscoveryProps {
  onSelectProduct: (product: Product) => void;
}

export const MoodDiscovery: React.FC<MoodDiscoveryProps> = ({ onSelectProduct }) => {
  const [selectedMood, setSelectedMood] = useState<MoodKey>('calm');
  const { addToCart } = useCart();

  const { products, loading, error } = useCatalog();
  const { product, reason } = getRecommendationForMood(products, selectedMood);
  const currentMoodItem = MOOD_DISCOVERY_ITEMS.find((m) => m.id === selectedMood) || MOOD_DISCOVERY_ITEMS[3];

  return (
    <section id="mood-discovery" className="py-16 md:py-24 bg-[#F2ECE1]/60 border-b border-[#E5DCCE]/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-2xl mx-auto text-center space-y-3 mb-12">
          <p className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
            Intuitive Mood Discovery
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight">
            How do you want to feel?
          </h2>
          <p className="text-sm sm:text-base text-[#65412E]">
            Tell us what you need right now, and we’ll help you find your flame.
          </p>
        </div>

        {/* 6 Interactive Mood Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-10">
          {MOOD_DISCOVERY_ITEMS.map((item) => {
            const isSelected = selectedMood === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedMood(item.id)}
                className={`relative text-left p-4 sm:p-5 rounded-2xl transition-all duration-300 flex flex-col justify-between h-36 sm:h-44 border ${
                  isSelected
                    ? 'bg-[#FAF7F2] border-[#D18D4D] shadow-md ring-2 ring-[#D18D4D]/20 transform -translate-y-1'
                    : 'bg-[#FAF7F2]/70 hover:bg-[#FAF7F2] border-[#E5DCCE] hover:border-[#DBC4A9] shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
                        isSelected ? 'text-[#D18D4D]' : 'text-[#79716B]'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full transition-transform ${
                        isSelected ? 'scale-125 bg-[#D18D4D]' : 'bg-[#E5DCCE]'
                      }`}
                    />
                  </div>
                  <p className="text-sm font-serif font-medium text-[#1F1B18] leading-snug">
                    "{item.quote}"
                  </p>
                </div>

                <p className="text-[11px] text-[#79716B] line-clamp-2 mt-2 leading-relaxed">
                  {item.subtext}
                </p>
              </button>
            );
          })}
        </div>

        {/* Personalized Interactive Recommendation Panel */}
        <div className="bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm transition-all duration-500">
          {!product ? (
            <p className="text-xs text-[#79716B] text-center py-10">
              {loading ? 'Loading the collection…' : error || 'The collection is being prepared. Please check back soon.'}
            </p>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left: Product Image & Quick Preview */}
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#F2ECE1] border border-[#E5DCCE] group">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                  key={product.id}
                />
                <div className="absolute top-3 left-3 bg-[#FAF7F2]/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-semibold text-[#9E6D47] uppercase tracking-wider">
                  Recommended For You
                </div>
                <div className="absolute bottom-3 right-3 bg-[#1F1B18]/80 text-[#FAF7F2] px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">
                  ₹{product.price}
                </div>
              </div>
            </div>

            {/* Right: Emotional Message, Explanation, Ritual & CTAs */}
            <div className="lg:col-span-7 space-y-5">
              {/* Chosen Mood Banner */}
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#9E6D47]">
                  <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                  <span>You Chose: {currentMoodItem.label}</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-serif text-[#1F1B18] tracking-tight">
                  "{currentMoodItem.quote}"
                </h3>
              </div>

              {/* Product Match Info */}
              <div className="p-4 bg-[#F2ECE1]/60 rounded-xl border border-[#E5DCCE]/80 space-y-2">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-lg font-serif font-bold text-[#1F1B18]">
                    {product.name}
                  </h4>
                  <span className="text-sm font-semibold text-[#1F1B18] font-sans">
                    ₹{product.price}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#65412E] leading-relaxed">
                  {reason}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(product.howItFeels || ['Calm', 'Serene']).map((feel) => (
                    <span
                      key={feel}
                      className="text-[11px] text-[#79716B] bg-[#FAF7F2] px-2.5 py-0.5 rounded-md border border-[#E5DCCE]"
                    >
                      {feel}
                    </span>
                  ))}
                </div>
              </div>

              {/* Calm Flame Ritual */}
              {product.ritual && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                    <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Your Calm Flame Ritual</span>
                    {product.ritual.bestTime && <span className="text-[#79716B] font-normal">· {product.ritual.bestTime}</span>}
                  </div>
                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#65412E]">
                    {product.ritual.steps.slice(0, 4).map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-[#F2ECE1]/30 p-2.5 rounded-lg border border-[#E5DCCE]/40">
                        <span className="w-4 h-4 rounded-full bg-[#E5DCCE] text-[#1F1B18] font-semibold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onSelectProduct(product)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full transition-all"
                >
                  <span>Explore Your Flame</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {product.priceStatus !== 'missing' && product.price > 0 && (
                  <button
                    onClick={() => addToCart(product, 1)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-[#4A2F22] hover:text-[#1F1B18] bg-[#F2ECE1] hover:bg-[#E5DCCE] rounded-full border border-[#DBC4A9] transition-all"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#9E6D47]" />
                    <span>Add to Bag (₹{product.price})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </section>
  );
};
