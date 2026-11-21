import { MOOD_DISCOVERY_ITEMS, BRAND_CATEGORIES } from '../data/siteContent';
import { Product, MoodKey, BrandCategoryKey, CandleRitual } from '../types';

export interface QuizRecommendationResult {
  primary: Product;
  secondary?: Product;
  matchReason: string;
  recommendedRitual: CandleRitual;
}

const DEFAULT_RITUAL: CandleRitual = {
  bestTime: 'Evening unwind or mindful transition',
  setTheMood: 'Dim overhead lights, step away from screens, and welcome quiet presence.',
  steps: [
    'Place your candle or sachet safely in your personal sanctuary.',
    'Light the wick with intention or hang the botanical sachet in your space.',
    'Take three slow, deep belly breaths as the natural botanicals diffuse.',
    'Give yourself ten uninterrupted minutes of quiet resting presence.'
  ],
  mantra: 'I welcome stillness, warmth, and peace into my space.'
};

/**
 * Recommends an authentic product from the live catalogue based on the selected mood.
 * `product` is undefined only while the catalogue is empty / loading.
 */
export function getRecommendationForMood(
  products: Product[],
  moodId: MoodKey
): { product: Product | undefined; reason: string } {
  const moodItem = MOOD_DISCOVERY_ITEMS.find((m) => m.id === moodId) || MOOD_DISCOVERY_ITEMS[0];
  const product = products.find((p) => p.id === moodItem.recommendedProductId) || products[0];

  const reason =
    product?.matchReasons?.[moodId] ||
    moodItem.personalizedMessage ||
    `Specially blended to accompany your ${moodItem.label.toLowerCase()} moments.`;

  return {
    product,
    reason
  };
}

/**
 * Quiz Discovery Algorithm matching user emotional state, moment, scent, and intensity
 * Grounded in the real catalogue
 */
export function getRecommendationFromQuiz(
  products: Product[],
  answers: {
    feeling: string;
    moment: string;
    scentPreference: string;
    intensity: string;
  }
): QuizRecommendationResult | null {
  const { feeling, moment, scentPreference, intensity } = answers;

  // Real candidate products
  const candidates = [
    'rose-wax-sachet',
    'ganpati-wax-sachet',
    'sunflower-wax-sachet',
    'golden-foil-wax-sachet',
    'tulip-wax-sachet',
    'orange-cinnamon-wax-sachet',
    'ganpati-bappa-hamper',
    'floral-lotus-urli',
    'jumbo-tealight-mogra',
    'peony-bloom',
    'golden-mogra-jar'
  ];

  const scores: Record<string, number> = {};
  candidates.forEach((id) => (scores[id] = 0));

  // 1. Feeling evaluation
  if (feeling === 'Stressed' || feeling === 'Restless') {
    scores['rose-wax-sachet'] += 4;
    scores['tulip-wax-sachet'] += 3;
    scores['jumbo-tealight-mogra'] += 2;
  } else if (feeling === 'Tired' || feeling === 'I just want some me-time') {
    scores['peony-bloom'] += 4;
    scores['golden-foil-wax-sachet'] += 3;
  } else if (feeling === 'Unmotivated') {
    scores['sunflower-wax-sachet'] += 4;
    scores['ganpati-wax-sachet'] += 2;
  } else if (feeling === 'Happy') {
    scores['ganpati-bappa-hamper'] += 4;
    scores['sunflower-wax-sachet'] += 2;
  }

  // 2. Moment evaluation
  if (moment === 'Evening unwind' || moment === 'Reading') {
    scores['golden-foil-wax-sachet'] += 4;
    scores['golden-mogra-jar'] += 3;
    scores['rose-wax-sachet'] += 2;
  } else if (moment === 'Bath' || moment === 'Date night') {
    scores['peony-bloom'] += 4;
    scores['rose-wax-sachet'] += 3;
  } else if (moment === 'Morning reset' || moment === 'Meditation') {
    scores['ganpati-wax-sachet'] += 4;
    scores['floral-lotus-urli'] += 3;
  } else if (moment === 'Gifting') {
    scores['ganpati-bappa-hamper'] += 5;
    scores['rose-wax-sachet'] += 3;
  }

  // 3. Scent Preference
  if (scentPreference === 'Floral') {
    scores['rose-wax-sachet'] += 4;
    scores['tulip-wax-sachet'] += 3;
    scores['jumbo-tealight-mogra'] += 3;
  } else if (scentPreference === 'Woody') {
    scores['ganpati-wax-sachet'] += 4;
    scores['golden-foil-wax-sachet'] += 4;
  } else if (scentPreference === 'Warm' || scentPreference === 'Sweet') {
    scores['orange-cinnamon-wax-sachet'] += 4;
    scores['golden-foil-wax-sachet'] += 3;
  }

  // Find top product
  const sortedIds = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  const primaryId = sortedIds[0] || 'rose-wax-sachet';
  const secondaryId = sortedIds[1];

  const primary = products.find((p) => p.id === primaryId) || products[0];
  const secondary = products.find((p) => p.id === secondaryId);
  if (!primary) return null; // catalogue not loaded yet

  // Craft bespoke human reason based on verified catalogue attributes
  let matchReason = `You are seeking a moment of ${feeling.toLowerCase()} for your ${moment.toLowerCase()}. `;
  if (primary.fragrance) {
    matchReason += `${primary.name} is crafted with verified ${primary.fragrance} botanicals to bring gentle presence to your space.`;
  } else {
    matchReason += `${primary.name} brings artisanal stillness to your intentional pauses.`;
  }

  return {
    primary,
    secondary,
    matchReason,
    recommendedRitual: primary.ritual || DEFAULT_RITUAL
  };
}

/**
 * Filter live products by one of the Brand Categories. Mood / scent categories cover every
 * live product; filter categories use the curated ID lists in siteContent.
 */
export function getProductsByCategory(products: Product[], categoryKey: BrandCategoryKey): Product[] {
  const categoryItem = BRAND_CATEGORIES.find((c) => c.id === categoryKey);
  if (!categoryItem || categoryItem.actionType === 'mood' || categoryItem.actionType === 'scent') return products;
  return products.filter((p) => categoryItem.associatedProductIds.includes(p.id));
}
