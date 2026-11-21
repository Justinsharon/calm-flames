import React from 'react';
import { BRAND_CATEGORIES } from '../../data/siteContent';
import { BrandCategoryKey } from '../../types';
import { Sparkles, ArrowRight } from 'lucide-react';

interface BrandCategoriesProps {
  selectedCategory: BrandCategoryKey | 'all';
  onSelectCategory: (categoryKey: BrandCategoryKey | 'all') => void;
  onOpenDiscovery: () => void;
  onOpenGiftFinder?: () => void;
}

export const BrandCategories: React.FC<BrandCategoriesProps> = ({
  selectedCategory,
  onSelectCategory,
  onOpenDiscovery,
  onOpenGiftFinder
}) => {
  return (
    <section id="categories-section" className="py-16 md:py-24 bg-[#FAF7F2] border-b border-[#E5DCCE]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-[#E5DCCE]">
          <div>
            <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
              Shop By Category
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight">
              Explore the Collections
            </h2>
            <p className="text-sm text-[#79716B] mt-1.5 max-w-xl">
              From handcrafted aromatherapy candles to sacred rituals and gifting stillness.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* The User-Requested 'Find Your Flame' Button */}
            <button
              onClick={onOpenDiscovery}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium tracking-wide text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full shadow-sm hover:shadow-md transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
              <span>Find Your Flame</span>
            </button>

            {selectedCategory !== 'all' && (
              <button
                onClick={() => onSelectCategory('all')}
                className="text-xs font-medium text-[#9E6D47] hover:text-[#1F1B18] underline underline-offset-4 transition-colors"
              >
                Show All Categories
              </button>
            )}
          </div>
        </div>

        {/* Active Brand Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
          {BRAND_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;

            return (
              <div
                key={cat.id}
                onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
                className={`group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer border transition-all duration-500 shadow-sm hover:shadow-xl ${
                  isSelected
                    ? 'ring-3 ring-[#D18D4D] border-transparent transform -translate-y-1'
                    : 'border-[#E5DCCE] hover:border-[#D18D4D]/70 hover:-translate-y-1'
                }`}
              >
                {/* Category Photography */}
                <img
                  src={cat.image}
                  alt={`${cat.title} - ${cat.subtitle}`}
                  className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
                  loading="lazy"
                />

                {/* Cinematic Dark Scrim for Perfect Typography Contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5 transition-opacity duration-300 group-hover:from-black/90 group-hover:via-black/45" />

                {/* Active Indicator Chip */}
                {isSelected && (
                  <div className="absolute top-4 right-4 bg-[#D18D4D] text-white px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase shadow-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span>Selected</span>
                  </div>
                )}

                {/* Bottom Title & Subtitle Matching Screenshot */}
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7 flex flex-col justify-end text-left">
                  <h3 className="text-2xl sm:text-[26px] font-serif font-normal text-white tracking-tight leading-snug drop-shadow-sm group-hover:text-[#F5F0E6] transition-colors">
                    {cat.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-200/90 font-light mt-1 tracking-wide">
                    {cat.subtitle}
                  </p>

                  <div className="pt-3 flex items-center justify-between text-xs text-[#D18D4D] font-medium opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                    <div className="flex items-center gap-1.5">
                      <span>
                        {cat.id === 'gifting'
                          ? 'View curated gifts'
                          : cat.id === 'shop-by-mood'
                          ? 'Explore mood matches'
                          : cat.id === 'shop-by-scent'
                          ? 'Explore scent families'
                          : 'View collection candles'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>

                    {cat.id === 'gifting' && onOpenGiftFinder && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenGiftFinder();
                        }}
                        className="px-2.5 py-1 bg-[#D18D4D] hover:bg-[#B3743B] text-white rounded-full text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 shadow-sm transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>AI Gift Finder</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
