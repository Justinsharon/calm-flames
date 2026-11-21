import React, { useState } from 'react';
import { Product, BrandCategoryKey } from '../../types';
import { ProductCard } from './ProductCard';
import { getProductsByCategory } from '../../services/recommendationEngine';
import { BRAND_CATEGORIES } from '../../data/siteContent';
import { useCatalog } from '../../context/CatalogContext';
import { Sparkles, X, Search } from 'lucide-react';

interface ProductGridProps {
  onSelectProduct: (product: Product) => void;
  selectedCategory: BrandCategoryKey | 'all';
  onClearCategoryFilter: () => void;
  onOpenCompare?: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  onSelectProduct,
  selectedCategory,
  onClearCategoryFilter,
  onOpenCompare
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scentFilter, setScentFilter] = useState<string>('all');
  const { products, loading, error } = useCatalog();

  // Filter based on selectedCategory
  const categoryFiltered =
    selectedCategory === 'all'
      ? products
      : getProductsByCategory(products, selectedCategory);

  // Multi-attribute search filter (Section 18)
  const searchFiltered = categoryFiltered.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = p.name.toLowerCase().includes(q);
    const catMatch = (p.primaryCategory || '').toLowerCase().includes(q);
    const subcatMatch = (p.subcategory || '').toLowerCase().includes(q);
    const fragranceMatch = (p.fragrance || '').toLowerCase().includes(q);
    const scentMatch = (p.scentFamily || '').toLowerCase().includes(q);
    const tagMatch = (p.tags || []).some((t) => t.toLowerCase().includes(q));
    const moodMatch = (p.moods || []).some((m) => m.toLowerCase().includes(q));
    const colMatch = (p.collections || []).some((c) => c.toLowerCase().includes(q));
    return nameMatch || catMatch || subcatMatch || fragranceMatch || scentMatch || tagMatch || moodMatch || colMatch;
  });

  const finalFiltered =
    scentFilter === 'all'
      ? searchFiltered
      : searchFiltered.filter((p) => p.scentFamily === scentFilter);

  const scentFamilies = ['all', 'Floral', 'Woody', 'Citrus', 'Earthy', 'Spiced'];

  const currentCategoryObj =
    selectedCategory !== 'all'
      ? BRAND_CATEGORIES.find((c) => c.id === selectedCategory)
      : null;

  return (
    <section id="shop-catalog" className="py-16 md:py-24 bg-[#FAF7F2] border-b border-[#E5DCCE]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#E5DCCE]">
          <div>
            <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
              The Candle Collection
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#1F1B18] tracking-tight">
              Flames of Intention
            </h2>
            <p className="text-xs sm:text-sm text-[#79716B] mt-1">
              Hand-poured 100% natural wax candles, traditional urlis, and festive offerings.
            </p>
          </div>

          {/* Search & Filters Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Mogra, Laddoo, Jasmine..."
                className="w-full sm:w-64 pl-9 pr-8 py-2 bg-white text-xs border border-[#DBC4A9] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#D18D4D] text-[#1F1B18]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Scent Family Filter Tabs & Compare Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 p-1 bg-[#F2ECE1] rounded-xl overflow-x-auto max-w-full">
                {scentFamilies.map((family) => {
                  const isActive = scentFilter === family;
                  return (
                    <button
                      key={family}
                      onClick={() => setScentFilter(family)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[#FAF7F2] text-[#1F1B18] shadow-xs font-semibold'
                          : 'text-[#65412E] hover:text-[#1F1B18]'
                      }`}
                    >
                      {family === 'all' ? 'All Scents' : family}
                    </button>
                  );
                })}
              </div>

              {onOpenCompare && (
                <button
                  onClick={onOpenCompare}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F2ECE1] text-[#4A2F22] border border-[#DBC4A9] shadow-2xs transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                  <span>Compare</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Category Filter Tag if filtered */}
        {currentCategoryObj && (
          <div className="mb-8 inline-flex items-center gap-2.5 bg-[#F2ECE1] border border-[#DBC4A9] px-4 py-2 rounded-full text-xs text-[#4A2F22] shadow-xs">
            <span>
              Category:{' '}
              <strong className="font-semibold text-[#1F1B18]">{currentCategoryObj.title}</strong>{' '}
              <span className="text-[#79716B]">({currentCategoryObj.subtitle})</span>
            </span>
            <button
              onClick={onClearCategoryFilter}
              className="text-[#9E6D47] hover:text-[#1F1B18] p-0.5 rounded-full hover:bg-stone-200/50 transition-colors ml-1"
              aria-label="Clear category filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Catalogue loading / error state */}
        {loading && (
          <p className="text-center py-16 text-xs text-[#79716B]" role="status" aria-live="polite">
            Loading the collection…
          </p>
        )}
        {!loading && error && (
          <p className="text-center py-16 text-xs text-[#79716B]" role="alert">
            {error}
          </p>
        )}

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {finalFiltered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickView={onSelectProduct}
            />
          ))}
        </div>

        {!loading && !error && finalFiltered.length === 0 && (
          <div className="text-center py-16 bg-[#F2ECE1]/40 rounded-2xl border border-[#E5DCCE] p-8 space-y-3">
            <p className="text-lg font-serif text-[#1F1B18]">No candles match this specific selection.</p>
            <button
              onClick={() => {
                setScentFilter('all');
                onClearCategoryFilter();
              }}
              className="text-xs text-[#9E6D47] underline underline-offset-4 font-medium"
            >
              Reset filters to explore all candles
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
