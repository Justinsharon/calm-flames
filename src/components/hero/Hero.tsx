import React, { useState } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Flame, Leaf, Wind } from 'lucide-react';
import {
  HERO_ASSET,
  lotusUrliImg,
  jumboTealightsImg,
  royalUrliImg,
  modakCandlesImg
} from '../../data/products';

interface HeroProps {
  onOpenDiscovery: () => void;
  onExploreCandles: () => void;
  onOpenBreathing: () => void;
  onNavigateSection?: (sectionId: string) => void;
}

const HERO_SHOWCASE = [
  {
    id: 'lotus-urli',
    title: 'Floral Lotus Urli',
    subtitle: '4.5" Scalloped Brass Centerpiece',
    tag: 'Handcrafted in India',
    image: lotusUrliImg
  },
  {
    id: 'jumbo-tealights',
    title: 'Jumbo Tealight — Mogra',
    subtitle: '25g Hand-poured Natural Soy Wax',
    tag: 'Botanical Heritage',
    image: jumboTealightsImg
  },
  {
    id: 'royal-urli',
    title: 'Royal Botanical Urli',
    subtitle: '5" Dried Orange & Cinnamon Star',
    tag: 'Handcrafted in India',
    image: royalUrliImg
  },
  {
    id: 'modak-candles',
    title: 'Modak Candle Offering',
    subtitle: 'Sculpted Wax with Gold Leaf Touch',
    tag: 'Handcrafted in India',
    image: modakCandlesImg
  }
];

export const Hero: React.FC<HeroProps> = ({
  onOpenDiscovery,
  onExploreCandles,
  onOpenBreathing,
  onNavigateSection
}) => {
  const [activeShowcaseIdx, setActiveShowcaseIdx] = useState(0);
  const currentItem = HERO_SHOWCASE[activeShowcaseIdx];

  return (
    <section className="relative overflow-hidden bg-[#FAF7F2] pt-8 pb-16 md:pt-14 md:pb-24 border-b border-[#E5DCCE]/60">
      {/* Subtle ambient light gradient in the background */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-gradient-to-tr from-[#D18D4D]/15 via-[#E09E5C]/10 to-transparent rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Emotion-First Storytelling */}
          <div className="lg:col-span-6 space-y-6 md:space-y-7 z-10">
            {/* Subtle Brand Kicker - Clean unboxed text with separators */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#9E6D47] font-medium">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                Ancient scents. Modern rituals.
              </span>
              <span aria-hidden="true">·</span>
              <span>Handcrafted with intention in India</span>
            </div>

            {/* Core Brand Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif tracking-tight text-[#1F1B18] leading-[1.12] text-balance">
              Light. Breathe. <span className="italic font-normal text-[#9E6D47]">Be</span>.
            </h1>

            {/* Emotional Promise */}
            <p className="text-base sm:text-lg text-[#65412E] leading-relaxed max-w-xl font-normal">
              Handcrafted aromatherapy candles rooted in India's botanical heritage.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4">
              <button
                onClick={onExploreCandles}
                className="group relative inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5"
              >
                <span>Shop the Collection</span>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform duration-200" />
              </button>

              <button
                onClick={() => onNavigateSection ? onNavigateSection('story') : onOpenBreathing()}
                className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium text-[#4A2F22] hover:text-[#1F1B18] bg-[#F2ECE1] hover:bg-[#E5DCCE] rounded-full border border-[#DBC4A9]/70 transition-all duration-200"
              >
                Our Story
              </button>
            </div>

            {/* What Goes Into Every Flame */}
            <div className="pt-5 border-t border-[#E5DCCE]/70 space-y-3">
              <p className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
                What Goes Into Every Flame
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[#65412E]">
                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <Leaf className="w-3.5 h-3.5 text-[#9E6D47]" />
                    <span>Natural Wax</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Soy &amp; coconut blend. Clean-burning and kind to the earth.
                  </p>
                </div>
                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Pure Essential Oils</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    No synthetics. Only botanicals your body recognises.
                  </p>
                </div>
                <div className="space-y-1 bg-[#F2ECE1]/40 p-3 rounded-xl border border-[#E5DCCE]/60">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#9E6D47]" />
                    <span>Eco Packaging</span>
                  </div>
                  <p className="text-[11px] text-[#79716B] leading-relaxed">
                    Thoughtfully sourced, minimal waste, endlessly recyclable.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual with Real Product Showcase */}
          <div className="lg:col-span-6 relative">
            <div className="relative mx-auto max-w-lg lg:max-w-none space-y-3">
              {/* Main Lookbook Photography Frame */}
              <div className="relative rounded-2xl overflow-hidden bg-[#F2ECE1] p-2 sm:p-3 shadow-md border border-[#E5DCCE]">
                <div className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-xl bg-stone-100">
                  <img
                    src={currentItem.image}
                    alt={currentItem.title}
                    className="w-full h-full object-cover object-center transition-all duration-700 ease-out hover:scale-105"
                    loading="eager"
                  />
                  {/* Gentle warm gradient overlay at the base */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />

                  {/* Gentle floating badge at the bottom corner */}
                  <div className="absolute bottom-4 left-4 right-4 bg-[#FAF7F2]/95 backdrop-blur-md px-4 py-2.5 rounded-lg border border-[#E5DCCE] shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#D18D4D] animate-pulse shrink-0" />
                      <div className="truncate">
                        <p className="text-[11px] uppercase tracking-wider text-[#9E6D47] font-semibold">
                          {currentItem.tag}
                        </p>
                        <p className="text-xs text-[#1F1B18] font-serif font-bold truncate">
                          {currentItem.title}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#79716B] shrink-0 font-sans hidden sm:inline">
                      {currentItem.subtitle}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lookbook Quick Thumbnails Switcher */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {HERO_SHOWCASE.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveShowcaseIdx(idx)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all border ${
                      activeShowcaseIdx === idx
                        ? 'bg-[#4A2F22] text-white border-[#4A2F22] shadow-xs'
                        : 'bg-[#FAF7F2] text-[#65412E] border-[#E5DCCE] hover:bg-[#F2ECE1]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        activeShowcaseIdx === idx ? 'bg-[#D18D4D]' : 'bg-stone-300'
                      }`}
                    />
                    <span className="truncate max-w-[120px]">{item.title}</span>
                  </button>
                ))}
              </div>

              {/* Decorative warm aura glow behind image */}
              <div
                className="absolute -bottom-6 -right-6 w-36 h-36 bg-[#D18D4D]/25 rounded-full blur-2xl pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
