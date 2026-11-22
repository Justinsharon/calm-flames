import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { StoreSettingsProvider } from './context/StoreSettingsContext';
import { TaxonomyProvider } from './context/TaxonomyContext';
import { testFirestoreConnection } from './lib/firebase';
import { INFO_PAGE_SLUGS } from './lib/routes';
import { StorefrontLayout } from './storefront/StorefrontLayout';
import { HomePage } from './storefront/pages/HomePage';
import { CollectionPage } from './storefront/pages/CollectionPage';
import { ProductPage } from './storefront/pages/ProductPage';
import { ScentPage } from './storefront/pages/ScentPage';
import { GiftingPage } from './storefront/pages/GiftingPage';
import { ArticlePage, JournalPage } from './storefront/pages/JournalPages';
import { InfoPage } from './storefront/pages/InfoPage';
import { SupportPage } from './storefront/pages/SupportPage';
import { NotFoundPage } from './storefront/pages/NotFoundPage';
import { CartPage } from './storefront/pages/CartPage';
import { BuildBoxPage } from './storefront/pages/BuildBoxPage';
import { CheckoutPage } from './storefront/pages/CheckoutPage';
import { ConfirmedPage } from './storefront/pages/ConfirmedPage';

/** Route table mirrors src/lib/routes.ts (also used by the server for titles and 404s). */
export function StorefrontRoutes() {
  return (
    <Routes>
      <Route element={<StorefrontLayout />}>
        <Route index element={<HomePage />} />
        <Route path="collections/:slug" element={<CollectionPage />} />
        <Route path="products/:slug" element={<ProductPage />} />
        <Route path="scent" element={<ScentPage />} />
        <Route path="scent/:family" element={<ScentPage />} />
        <Route path="gifting" element={<GiftingPage />} />
        <Route path="gifting/:occasion" element={<GiftingPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="journal/:slug" element={<ArticlePage />} />
        {INFO_PAGE_SLUGS.map((s) => (
          <Route key={s} path={s} element={<InfoPage />} />
        ))}
        <Route path="support" element={<SupportPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="build-a-box" element={<BuildBoxPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="order/:id/confirmed" element={<ConfirmedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    testFirestoreConnection();
  }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <CatalogProvider>
          <TaxonomyProvider>
            <StoreSettingsProvider>
              <CartProvider>
                <WishlistProvider>
                  <StorefrontRoutes />
                </WishlistProvider>
              </CartProvider>
            </StoreSettingsProvider>
          </TaxonomyProvider>
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
