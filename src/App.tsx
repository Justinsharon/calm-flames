import React, { useState, useEffect } from 'react';
import { CartProvider, useCart } from './context/CartContext';
import { WishlistProvider, useWishlist } from './context/WishlistContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/navigation/Navbar';
import { Hero } from './components/hero/Hero';
import { PersonalizedWelcome } from './components/personalization/PersonalizedWelcome';
import { BrandCategories } from './components/categories/BrandCategories';
import { MoodDiscovery } from './components/mood/MoodDiscovery';
import { BreathingRitual } from './components/ambient/BreathingRitual';
import { ProductGrid } from './components/products/ProductGrid';
import { ProductDetailModal } from './components/products/ProductDetailModal';
import { FindYourFlameModal } from './components/discovery/FindYourFlameModal';
import { ShoppingAssistantModal } from './components/assistant/ShoppingAssistantModal';
import { ProductCompareModal } from './components/comparison/ProductCompareModal';
import { SmartGiftFinderModal } from './components/gifting/SmartGiftFinderModal';
import { CartDrawer } from './components/cart/CartDrawer';
import { CheckoutModal } from './components/checkout/CheckoutModal';
import { WishlistDrawer } from './components/wishlist/WishlistDrawer';
import { AuthModal } from './components/auth/AuthModal';
import { CustomerAccountDrawer } from './components/account/CustomerAccountDrawer';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { BrandStory } from './components/story/BrandStory';
import { WellnessJournal } from './components/journal/WellnessJournal';
import { Testimonials } from './components/testimonials/Testimonials';
import { RitualClub } from './components/newsletter/RitualClub';
import { PolicyModals, PolicyModalType } from './components/modals/PolicyModals';
import { Footer } from './components/footer/Footer';
import { Product, BrandCategoryKey, OrderRecord } from './types';
import { CatalogProvider, useCatalog } from './context/CatalogContext';
import { seedInitialCatalogIfNeeded } from './services/dbService';
import { testFirestoreConnection } from './lib/firebase';
import { Heart, Sparkles } from 'lucide-react';

const MainContent: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isGiftFinderOpen, setIsGiftFinderOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BrandCategoryKey | 'all'>('all');
  const [activeSection, setActiveSection] = useState('hero');
  const [activeModalPage, setActiveModalPage] = useState<PolicyModalType | null>(null);

  const { isCheckoutOpen, setIsCheckoutOpen } = useCart();
  const { lastFeedback, setIsWishlistOpen } = useWishlist();
  const { user, setIsAccountOpen } = useAuth();
  const { products, getProductById } = useCatalog();

  // Test connection and auto-seed initial catalog if needed
  useEffect(() => {
    testFirestoreConnection();
    seedInitialCatalogIfNeeded();
  }, []);

  const handleNavigateSection = (sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (sectionId === 'categories') {
      const el = document.getElementById('categories-section');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else if (sectionId === 'shop') {
      const el = document.getElementById('shop-catalog');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else if (sectionId === 'mood') {
      const el = document.getElementById('mood-discovery');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else if (sectionId === 'breathing') {
      const el = document.getElementById('breathing-moment');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else if (sectionId === 'story') {
      const el = document.getElementById('our-story');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else if (sectionId === 'journal') {
      const el = document.getElementById('the-journal');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectCategory = (categoryKey: BrandCategoryKey | 'all') => {
    setSelectedCategory(categoryKey);

    if (categoryKey === 'shop-by-mood') {
      const el = document.getElementById('mood-discovery');
      el?.scrollIntoView({ behavior: 'smooth' });
    } else {
      const el = document.getElementById('shop-catalog');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOrderSuccess = (order: OrderRecord) => {
    // Order was successfully created and verified
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#1F1B18] selection:bg-[#D18D4D]/25 selection:text-[#1F1B18]">
      {/* Top Bar Navigation */}
      <Navbar
        onOpenDiscovery={() => setIsDiscoveryOpen(true)}
        onNavigateSection={handleNavigateSection}
        activeSection={activeSection}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        onOpenGiftFinder={() => setIsGiftFinderOpen(true)}
        onOpenModalPage={(page) => setActiveModalPage(page)}
      />

      {/* Main Experience Stream */}
      <main className="flex-1">
        {/* Section 1: Hero Experience */}
        <Hero
          onOpenDiscovery={() => setIsDiscoveryOpen(true)}
          onExploreCandles={() => handleNavigateSection('shop')}
          onOpenBreathing={() => handleNavigateSection('breathing')}
          onNavigateSection={handleNavigateSection}
        />

        {/* Phase 3: Section 6 - Personalized Homepage for Authenticated Customers */}
        <PersonalizedWelcome
          products={products}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenDiscovery={() => setIsDiscoveryOpen(true)}
        />

        {/* The 6 Brand Categories */}
        <BrandCategories
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          onOpenDiscovery={() => setIsDiscoveryOpen(true)}
          onOpenGiftFinder={() => setIsGiftFinderOpen(true)}
        />

        {/* Section 4: Interactive Mood Discovery ("How do you want to feel?") */}
        <MoodDiscovery onSelectProduct={(p) => setSelectedProduct(p)} />

        {/* Section 6: Breathing / Ambient Moment */}
        <BreathingRitual />

        {/* Section 8 & 9: Complete Product Grid & Scent/Category Filtering */}
        <ProductGrid
          onSelectProduct={(p) => setSelectedProduct(p)}
          selectedCategory={selectedCategory}
          onClearCategoryFilter={() => setSelectedCategory('all')}
          onOpenCompare={() => setIsCompareOpen(true)}
        />

        {/* Our Story & Pure Soy Craftsmanship */}
        <BrandStory onOpenStoryModal={() => setActiveModalPage('ingredients')} />

        {/* The Flame Journal */}
        <WellnessJournal />

        {/* What Your Quiet Moments Say */}
        <Testimonials />

        {/* The Ritual Club */}
        <RitualClub />
      </main>

      {/* Footer Experience */}
      <Footer
        onNavigateSection={handleNavigateSection}
        onOpenDiscovery={() => setIsDiscoveryOpen(true)}
        onOpenBreathing={() => handleNavigateSection('breathing')}
        onOpenModalPage={(page) => setActiveModalPage(page)}
      />

      {/* Floating Concierge Beacon ("Ask The Calm Flame") */}
      <button
        onClick={() => setIsAssistantOpen(true)}
        className="fixed bottom-6 right-6 z-40 px-4 py-2.5 bg-[#2A2521] hover:bg-[#4A2F22] text-white rounded-full text-xs font-semibold shadow-xl border border-[#4A2F22] flex items-center gap-2 transition-all hover:scale-105 group"
        aria-label="Ask The Calm Flame Concierge"
      >
        <Sparkles className="w-3.5 h-3.5 text-[#D18D4D] group-hover:rotate-12 transition-transform" />
        <span className="hidden sm:inline">Ask The Calm Flame</span>
        <span className="sm:hidden">Concierge</span>
      </button>

      {/* Interactive Modals & Slide-out Drawers */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <FindYourFlameModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />

      {/* Phase 3: AI Shopping Assistant */}
      <ShoppingAssistantModal
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onSelectProductById={(productId) => {
          const found = getProductById(productId);
          if (found) setSelectedProduct(found);
        }}
      />

      {/* Phase 3: Product Comparison Modal */}
      <ProductCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        products={products}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />

      {/* Phase 3: Smart Gift Finder Modal */}
      <SmartGiftFinderModal
        isOpen={isGiftFinderOpen}
        onClose={() => setIsGiftFinderOpen(false)}
        products={products}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />

      <CartDrawer
        onExplore={() => handleNavigateSection('shop')}
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderSuccess={handleOrderSuccess}
      />

      <WishlistDrawer
        onExplore={() => handleNavigateSection('shop')}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />

      {/* Auth Modal (Sign In / Sign Up / Forgot Password) */}
      <AuthModal />

      {/* Customer Account Area ("My Calm Flame") */}
      <CustomerAccountDrawer
        onOpenAdmin={() => setIsAdminDashboardOpen(true)}
        onExploreProducts={() => handleNavigateSection('shop')}
      />

      {/* Admin Dashboard */}
      <AdminDashboard
        isOpen={isAdminDashboardOpen}
        onClose={() => setIsAdminDashboardOpen(false)}
      />

      {/* Policy & Info Modals */}
      <PolicyModals
        activeType={activeModalPage}
        onClose={() => setActiveModalPage(null)}
      />

      {/* Wishlist Floating Feedback Toast */}
      {lastFeedback?.visible && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#2A2521] text-white px-4 py-2.5 rounded-full text-xs font-medium shadow-xl flex items-center gap-2 border border-[#4A2F22] animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <Heart className="w-3.5 h-3.5 text-[#D18D4D] fill-current" />
          <span>{lastFeedback.message}</span>
          <button
            onClick={() => setIsWishlistOpen(true)}
            className="text-[#D18D4D] underline font-semibold ml-1 cursor-pointer"
          >
            View
          </button>
        </aside>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <CartProvider>
          <WishlistProvider>
            <MainContent />
          </WishlistProvider>
        </CartProvider>
      </CatalogProvider>
    </AuthProvider>
  );
}
