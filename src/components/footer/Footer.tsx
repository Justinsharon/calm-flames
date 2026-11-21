import React, { useState } from 'react';
import { Flame, ArrowRight, Check } from 'lucide-react';

interface FooterProps {
  onNavigateSection: (sectionId: string) => void;
  onOpenDiscovery: () => void;
  onOpenBreathing: () => void;
  onOpenModalPage?: (page: 'faq' | 'candle-care' | 'shipping-policy' | 'refund-policy' | 'contact' | 'ingredients' | 'sustainability' | 'stockists') => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateSection,
  onOpenDiscovery,
  onOpenModalPage
}) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes('@')) {
      setSubscribed(true);
      setEmail('');
    }
  };

  const handleModalClick = (page: 'faq' | 'candle-care' | 'shipping-policy' | 'refund-policy' | 'contact' | 'ingredients' | 'sustainability' | 'stockists') => {
    onOpenModalPage?.(page);
  };

  return (
    <footer className="bg-[#1F1B18] text-[#FAF7F2] pt-16 pb-12 border-t border-[#4A2F22]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14">
          {/* Brand Column */}
          <div className="md:col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#D18D4D]" />
              <span className="text-2xl font-serif tracking-tight font-bold text-white">
                The Calm Flame
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#E5DCCE]/70 leading-relaxed italic font-serif">
              Ancient scents. Modern rituals.
            </p>
            <p className="text-xs text-[#E5DCCE]/60 leading-relaxed pt-1">
              Handcrafted aromatherapy candles rooted in India's botanical heritage. 100% natural soy wax and pure essential oils.
            </p>
          </div>

          {/* Shop Column */}
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#D18D4D]">
              Shop
            </h4>
            <ul className="space-y-2 text-xs text-[#E5DCCE]/80">
              <li>
                <button
                  onClick={() => onNavigateSection('categories')}
                  className="hover:text-white transition-colors text-left"
                >
                  Aromatherapy Candles
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('categories')}
                  className="hover:text-white transition-colors text-left"
                >
                  Ritual Collection
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('categories')}
                  className="hover:text-white transition-colors text-left"
                >
                  Gifting
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('mood')}
                  className="hover:text-white transition-colors text-left"
                >
                  Shop by Mood
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('shop')}
                  className="hover:text-white transition-colors text-left"
                >
                  Shop by Scent
                </button>
              </li>
            </ul>
          </div>

          {/* Help Column */}
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#D18D4D]">
              Help
            </h4>
            <ul className="space-y-2 text-xs text-[#E5DCCE]/80">
              <li>
                <button
                  onClick={() => handleModalClick('faq')}
                  className="hover:text-white transition-colors text-left"
                >
                  FAQs
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('candle-care')}
                  className="hover:text-white transition-colors text-left"
                >
                  Candle Care
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('shipping-policy')}
                  className="hover:text-white transition-colors text-left"
                >
                  Shipping Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('refund-policy')}
                  className="hover:text-white transition-colors text-left"
                >
                  Refund Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('contact')}
                  className="hover:text-white transition-colors text-left"
                >
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* About Column */}
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#D18D4D]">
              About
            </h4>
            <ul className="space-y-2 text-xs text-[#E5DCCE]/80">
              <li>
                <button
                  onClick={() => onNavigateSection('story')}
                  className="hover:text-white transition-colors text-left"
                >
                  Our Story
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('ingredients')}
                  className="hover:text-white transition-colors text-left"
                >
                  Ingredients
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('sustainability')}
                  className="hover:text-white transition-colors text-left"
                >
                  Sustainability
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleModalClick('stockists')}
                  className="hover:text-white transition-colors text-left"
                >
                  Stockists
                </button>
              </li>
            </ul>
          </div>

          {/* The Ritual Club Newsletter */}
          <div className="md:col-span-3 space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-widest text-[#9E6D47] font-semibold">
                The Ritual Club
              </span>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-[#D18D4D]">
                Join the Ritual
              </h4>
            </div>
            <p className="text-xs text-[#E5DCCE]/70 leading-relaxed">
              Get early access to new collections, seasonal scents, and calm delivered to your inbox.
            </p>
            <p className="text-[11px] text-[#D18D4D] font-medium">
              ✦ 10% off your first order when you subscribe
            </p>

            {subscribed ? (
              <div className="p-3 bg-[#4A2F22]/80 border border-[#D18D4D]/50 rounded-xl text-xs text-[#FAF7F2] flex items-center gap-2">
                <Check className="w-4 h-4 text-[#D18D4D] shrink-0" />
                <span>You're in. Welcome to the ritual. ✦</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your email"
                    className="flex-1 px-3 py-2 text-xs bg-[#2A2521] border border-[#4A2F22] rounded-xl text-white placeholder-stone-500 focus:outline-none focus:border-[#D18D4D]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-[#D18D4D] hover:bg-[#C27D38] text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
                    aria-label="Light the Way"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Original Copyright Sub-Footer */}
        <div className="pt-8 border-t border-[#4A2F22]/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#E5DCCE]/60">
          <p>© 2025 The Calm Flame. Handcrafted with intention in India.</p>
          <div className="flex items-center gap-4 text-xs">
            <button onClick={() => handleModalClick('contact')} className="hover:text-white transition-colors">
              mail@thecalmflames.com
            </button>
            <span aria-hidden="true">·</span>
            <span>+91 9663995025</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
