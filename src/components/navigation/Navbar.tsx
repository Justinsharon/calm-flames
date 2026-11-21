import React, { useState } from 'react';
import { ShoppingBag, Heart, Sparkles, Menu, X, User as UserIcon, ShieldCheck } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';

interface NavbarProps {
  onOpenDiscovery: () => void;
  onNavigateSection: (sectionId: string) => void;
  activeSection: string;
  onOpenAssistant?: () => void;
  onOpenGiftFinder?: () => void;
  onOpenModalPage?: (page: 'faq' | 'candle-care' | 'shipping-policy' | 'refund-policy' | 'contact' | 'ingredients' | 'sustainability' | 'stockists') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDiscovery,
  onNavigateSection,
  activeSection,
  onOpenAssistant,
  onOpenGiftFinder,
  onOpenModalPage
}) => {
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();
  const { user, profile, isAdmin, setIsAuthModalOpen, setIsAccountOpen } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const handleNavClick = (sectionId: string) => {
    onNavigateSection(sectionId);
    setMobileMenuOpen(false);
  };

  const handleModalClick = (page: 'faq' | 'candle-care' | 'shipping-policy' | 'refund-policy' | 'contact' | 'ingredients' | 'sustainability' | 'stockists') => {
    setMobileMenuOpen(false);
    onOpenModalPage?.(page);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E5DCCE]/60 transition-all duration-300">
      {/* Original Announcement Bar */}
      {!bannerDismissed && (
        <div className="bg-[#2A2521] text-[#FAF7F2] text-[11px] md:text-xs py-2 px-4 flex items-center justify-between tracking-wide">
          <div className="flex-1 text-center font-normal overflow-x-auto whitespace-nowrap py-0.5">
            <span>✦ Free shipping on orders above ₹1,500 ✦ Handcrafted with intention in India ✦ 100% Natural Soy Wax ✦ Cruelty-Free &amp; Vegan ✦</span>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-stone-400 hover:text-white p-0.5 ml-2 transition-colors shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Bar Contract (One Row, 3 Zones) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleNavClick('hero')}
            className="group text-left text-xl md:text-2xl font-serif tracking-tight text-[#1F1B18] hover:text-[#9E6D47] transition-colors font-medium"
          >
            The Calm Flame
          </button>
        </div>

        {/* Zone 2: Original navigation links */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-7 text-xs font-medium uppercase tracking-wider text-[#65412E]">
          <button
            onClick={() => handleNavClick('hero')}
            className={`transition-colors py-1 relative ${
              activeSection === 'hero' ? 'text-[#1F1B18] font-semibold' : 'hover:text-[#1F1B18]'
            }`}
          >
            Home
            {activeSection === 'hero' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D18D4D]" />
            )}
          </button>
          <button
            onClick={() => handleNavClick('shop')}
            className={`transition-colors py-1 relative ${
              activeSection === 'shop' ? 'text-[#1F1B18] font-semibold' : 'hover:text-[#1F1B18]'
            }`}
          >
            Shop
            {activeSection === 'shop' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D18D4D]" />
            )}
          </button>
          <button
            onClick={() => handleNavClick('story')}
            className={`transition-colors py-1 relative ${
              activeSection === 'story' ? 'text-[#1F1B18] font-semibold' : 'hover:text-[#1F1B18]'
            }`}
          >
            Our Story
            {activeSection === 'story' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D18D4D]" />
            )}
          </button>
          <button
            onClick={() => handleNavClick('journal')}
            className={`transition-colors py-1 relative ${
              activeSection === 'journal' ? 'text-[#1F1B18] font-semibold' : 'hover:text-[#1F1B18]'
            }`}
          >
            Journal
            {activeSection === 'journal' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D18D4D]" />
            )}
          </button>
          <button
            onClick={() => handleModalClick('contact')}
            className="hover:text-[#1F1B18] transition-colors py-1"
          >
            Contact
          </button>
          <button
            onClick={() => handleModalClick('faq')}
            className="hover:text-[#1F1B18] transition-colors py-1"
          >
            FAQ
          </button>
          <button
            onClick={() => handleModalClick('ingredients')}
            className="hover:text-[#1F1B18] transition-colors py-1"
          >
            Ingredients
          </button>
        </nav>

        {/* Zone 3: Primary actions & utility controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Ask The Calm Flame Concierge */}
          {onOpenAssistant && (
            <button
              onClick={onOpenAssistant}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#65412E] hover:text-[#1F1B18] bg-[#F2ECE1] hover:bg-[#E5DCCE] rounded-full border border-[#DBC4A9] transition-colors"
              title="Ask The Calm Flame Concierge"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
              <span>Concierge</span>
            </button>
          )}

          {/* Prominent 'Find Your Flame' Button */}
          <button
            onClick={onOpenDiscovery}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium tracking-wide text-[#FAF7F2] bg-[#2A2521] hover:bg-[#4A2F22] rounded-full shadow-sm hover:shadow transition-all duration-200"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
            <span className="hidden sm:inline">Find Your Flame</span>
          </button>

          {/* User Auth / Account Button */}
          {user ? (
            <button
              onClick={() => setIsAccountOpen(true)}
              className="p-2 text-[#4A2F22] hover:text-[#1F1B18] hover:bg-[#EADECD]/50 rounded-full transition-colors flex items-center gap-1.5"
              aria-label="Open customer account"
            >
              <div className="w-6 h-6 rounded-full bg-[#D18D4D] text-white flex items-center justify-center text-xs font-bold font-serif">
                {profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              {isAdmin && (
                <span className="hidden xl:inline text-[10px] uppercase font-bold text-[#D18D4D] tracking-wider">
                  Admin
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="p-2.5 text-[#4A2F22] hover:text-[#1F1B18] hover:bg-[#EADECD]/50 rounded-full transition-colors"
              aria-label="Sign in"
            >
              <UserIcon className="w-4 h-4" />
            </button>
          )}

          {/* Wishlist Button */}
          <button
            onClick={() => setIsWishlistOpen(true)}
            className="relative p-2.5 text-[#4A2F22] hover:text-[#1F1B18] hover:bg-[#EADECD]/50 rounded-full transition-colors"
            aria-label="View saved rituals"
          >
            <Heart className="w-4 h-4" />
            {wishlist.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-semibold flex items-center justify-center bg-[#D18D4D] text-white rounded-full">
                {wishlist.length}
              </span>
            )}
          </button>

          {/* Cart Bag Button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2.5 text-[#4A2F22] hover:text-[#1F1B18] hover:bg-[#EADECD]/50 rounded-full transition-colors"
            aria-label="View Cart"
          >
            <ShoppingBag className="w-4 h-4" />
            {totalItems > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-semibold flex items-center justify-center bg-[#2A2521] text-white rounded-full">
                {totalItems}
              </span>
            )}
          </button>

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-[#4A2F22] hover:text-[#1F1B18] rounded-md transition-colors"
            aria-label="Open mobile navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E5DCCE] bg-[#FAF7F2] px-6 py-5 space-y-4 shadow-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-3 text-sm font-medium tracking-wide text-[#65412E]">
            <button
              onClick={() => handleNavClick('hero')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => handleNavClick('shop')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Shop
            </button>
            <button
              onClick={() => handleNavClick('story')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Our Story
            </button>
            <button
              onClick={() => handleNavClick('journal')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Journal
            </button>
            <button
              onClick={() => handleModalClick('contact')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Contact
            </button>
            <button
              onClick={() => handleModalClick('faq')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              FAQ
            </button>
            <button
              onClick={() => handleModalClick('ingredients')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Ingredients
            </button>
            <button
              onClick={() => handleModalClick('candle-care')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Candle Care
            </button>
            <button
              onClick={() => handleModalClick('shipping-policy')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Shipping Policy
            </button>
            <button
              onClick={() => handleModalClick('refund-policy')}
              className="text-left py-2 hover:text-[#1F1B18] transition-colors"
            >
              Refund Policy
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDiscovery();
              }}
              className="text-left py-2 text-[#9E6D47] font-semibold flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#D18D4D]" />
              Find Your Flame
            </button>
          </div>

          <div className="pt-3 border-t border-[#E5DCCE] flex items-center justify-between text-xs text-[#79716B]">
            {user ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAccountOpen(true);
                }}
                className="text-[#1F1B18] font-semibold flex items-center gap-1.5"
              >
                <UserIcon className="w-3.5 h-3.5 text-[#D18D4D]" />
                <span>My Account ({profile?.fullName || user.email})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAuthModalOpen(true);
                }}
                className="text-[#D18D4D] font-semibold"
              >
                Sign In / Register
              </button>
            )}

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setIsWishlistOpen(true);
              }}
              className="text-[#9E6D47] font-medium"
            >
              Wishlist ({wishlist.length})
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
