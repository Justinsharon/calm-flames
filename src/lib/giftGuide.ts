/** Shared by the gift guide UI and server. */
export const GIFT_GUIDE_MAX_INPUT = 300;
export const GIFT_GUIDE_QUICK_REPLIES = ['For my mother', 'Housewarming', 'Diwali gifting', 'Under ₹1,000', 'Something floral', 'For someone who needs calm'];

export interface GiftSuggestion {
  productId: string;
  name: string;
  slug?: string;
  price: number;
  image?: string;
  reason: string;
}
export interface GiftGuideResponse {
  source: 'ai' | 'fallback';
  suggestions: GiftSuggestion[];
}
