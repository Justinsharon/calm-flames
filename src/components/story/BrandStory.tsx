import React, { useState } from 'react';
import { Sparkles, Leaf, Flame, ShieldCheck, Heart, ArrowRight } from 'lucide-react';
import { HERO_ASSET } from '../../data/siteContent';

interface BrandStoryProps {
  onOpenStoryModal?: () => void;
}

export const BrandStory: React.FC<BrandStoryProps> = ({ onOpenStoryModal }) => {
  const [showFullStory, setShowFullStory] = useState(false);

  return (
    <section id="our-story" className="py-16 md:py-24 bg-[#FAF7F2] border-b border-[#E5DCCE]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Visual Showcase Left */}
          <div className="lg:col-span-6 relative">
            <div className="relative rounded-3xl overflow-hidden bg-[#F2ECE1] p-3 border border-[#E5DCCE] shadow-md">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-stone-100">
                <img
                  src={HERO_ASSET}
                  alt="Handcrafted candles at The Calm Flame studio"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Quote Badge Overlaid */}
            <div className="absolute -bottom-6 -right-2 sm:right-6 bg-[#FAF7F2] border border-[#DBC4A9] p-4 sm:p-5 rounded-2xl shadow-lg max-w-xs">
              <p className="text-xs font-serif italic text-[#1F1B18] leading-relaxed">
                "Born from a quiet search for stillness."
              </p>
              <span className="text-[10px] uppercase tracking-wider text-[#9E6D47] font-semibold block mt-2">
                — The Calm Flame
              </span>
            </div>
          </div>

          {/* Editorial Content Right */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                Our Story
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight leading-tight">
                Born from Botanicals. Made for Modern Living.
              </h2>
            </div>

            <p className="text-base text-[#65412E] leading-relaxed font-normal">
              The Calm Flame brings India's ancient aromatherapy traditions into the contemporary home. Each candle is hand-poured with natural wax, pure essential oils, and eco-conscious materials — crafted to soothe the mind and nourish the soul.
            </p>

            {showFullStory ? (
              <div className="space-y-4 pt-2 text-sm text-[#79716B] leading-relaxed animate-in fade-in duration-300">
                <div>
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#1F1B18] mb-1">
                    Where It All Began
                  </h4>
                  <p>
                    The Calm Flame was born from a quiet search for stillness—during moments when life felt anything but calm.
                  </p>
                </div>
                <p>
                  After years immersed in the fast-paced corporate world, solace was found in the ancient Indian tradition of botanical wellness. What began as a personal ritual of crafting candles to restore balance soon evolved into a deeper purpose—to share that calm, intentionally and beautifully, with others.
                </p>
                <div>
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#1F1B18] mb-1">
                    Rooted in India's Scent Memory
                  </h4>
                  <p>
                    For centuries, Indian homes have been filled with the calming power of botanicals — from temple marigolds to forest sandalwood. We carry that tradition forward, one candle at a time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  onClick={() => setShowFullStory(true)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#1F1B18] hover:text-[#9E6D47] underline underline-offset-4 transition-colors"
                >
                  <span>Read Our Full Story</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Our Ingredients - 4 Pillars */}
            <div className="pt-6 border-t border-[#E5DCCE] space-y-3">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#1F1B18]">Our Ingredients</h3>
                <p className="text-xs text-[#9E6D47] mt-0.5">
                  Crafted with intention. Know exactly what goes into every flame.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1F1B18]">
                    <span className="text-sm" aria-hidden="true">🌿</span>
                    <span>Botanical Essences & Aromas</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Inspired by India's aromatic heritage, bringing calm and mindful presence into every space.
                  </p>
                </div>

                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1F1B18]">
                    <span className="text-sm" aria-hidden="true">🕯️</span>
                    <span>Natural Plant-Based Wax</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Poured for a clean, slow, and even burn across every intentional moment.
                  </p>
                </div>

                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1F1B18]">
                    <span className="text-sm" aria-hidden="true">🌺</span>
                    <span>Botanical Extracts</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Carefully chosen to enrich the sensory experience and preserve natural aromatic character.
                  </p>
                </div>

                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1F1B18]">
                    <span className="text-sm" aria-hidden="true">🧵</span>
                    <span>Lead-Free Wicks</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Carefully selected wicks for a steady, mindful flame.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
