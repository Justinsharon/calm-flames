/**
 * Static SITE content: brand copy, category tiles, mood prompts, journal articles and the
 * decorative artwork used by the hero / story / category sections.
 *
 * Product data (names, prices, stock, photos) does NOT live here. It is loaded from Firestore
 * `products` (see src/context/CatalogContext.tsx). Product IDs below are content references
 * that are resolved against the live catalogue at runtime.
 */
import { BrandCategoryItem, MoodDiscoveryItem } from '../types';

// Decorative brand artwork (hero, story, category tiles). Not used for product listings.
import lotusUrliImg from '../assets/images/lotus_urli_1791107260236.jpg';
import jumboTealightsImg from '../assets/images/jumbo_tealights_1791107239446.jpg';
import royalUrliImg from '../assets/images/royal_urli_1791107306618.jpg';
import modakCandlesImg from '../assets/images/modak_candles_1791107322524.jpg';
import corporateHamperImg from '../assets/images/corporate_hamper_1791107468493.jpg';
import peonyBloomImg from '../assets/images/peony_bloom_candle_1791107531344.jpg';

export { lotusUrliImg, jumboTealightsImg, royalUrliImg, modakCandlesImg };

export const HERO_ASSET = lotusUrliImg;

export const BRAND_CATEGORIES: BrandCategoryItem[] = [
  {
    id: 'aromatherapy-candles',
    title: 'Aromatherapy Candles',
    subtitle: 'Scents that heal',
    image: jumboTealightsImg,
    description: 'Our aromatherapy candles are crafted to do more than fill a room with fragrance—they are designed to transform how you feel.',
    associatedProductIds: [
      'jumbo-tealight-mogra',
      'jumbo-tealight-lotus-pond',
      'golden-mogra-jar',
      'peony-bloom',
      'lotus-bloom',
      'mandala-tin',
      'laddoo-shot',
      'rasmalai',
      'floating-daisy',
      'ganpati-wax-sachet',
      'golden-foil-wax-sachet',
      'sunflower-wax-sachet',
      'rose-wax-sachet',
      'tulip-wax-sachet',
      'orange-cinnamon-wax-sachet',
      'daisy-wax-sachet'
    ],
    actionType: 'filter'
  },
  {
    id: 'ritual-collection',
    title: 'Ritual Collection',
    subtitle: 'Intentional living',
    image: lotusUrliImg,
    description: 'The Ritual Collection is designed for intentional living—whether it is unwinding after a long day, setting the tone for meditation, or simply creating space for yourself.',
    associatedProductIds: [
      'floral-lotus-urli',
      'golden-foil-lotus-urli',
      'lotus-pond-urli',
      'mogra-lotus-urli',
      'lotus-bloom-bowl',
      'lotus-bloom-bowl-red',
      'royal-urli',
      'mithai-bowl',
      'modak',
      'laddoo',
      'pack-of-1-laddoo',
      'pack-of-2-laddoo',
      'pack-of-4-laddoo',
      'pack-of-4-modak-brown',
      'pack-of-4-laddoo-brown',
      'pack-of-4-laddoo-premium'
    ],
    actionType: 'filter'
  },
  {
    id: 'gifting',
    title: 'Gifting',
    subtitle: 'For the ones you love',
    image: corporateHamperImg,
    description: 'Because calm is the most thoughtful gift. Designed to offer a sense of comfort, warmth, and care that lingers long after the flame is gone.',
    associatedProductIds: [
      'ganpati-bappa-hamper'
    ],
    actionType: 'filter'
  },
  {
    id: 'shop-by-mood',
    title: 'Shop by Mood',
    subtitle: 'Find your feeling',
    image: peonyBloomImg,
    description: 'Every mood deserves its own space, its own scent, its own energy. Calm, Grounded, Uplifted, Sleepy, or Sensual.',
    // All live products (membership is not a fixed list)
    associatedProductIds: [],
    actionType: 'mood'
  },
  {
    id: 'shop-by-scent',
    title: 'Shop by Scent',
    subtitle: 'Follow your nose',
    image: royalUrliImg,
    description: 'Follow the fragrance that speaks to you. From floral and soothing to earthy and grounding, each scent tells its own story.',
    // All live products (membership is not a fixed list)
    associatedProductIds: [],
    actionType: 'scent'
  }
];

export const MOOD_DISCOVERY_ITEMS: MoodDiscoveryItem[] = [
  {
    id: 'calm',
    label: 'Calm',
    quote: 'I need to slow down.',
    subtext: 'Quiet the internal noise and welcome a peaceful, serene stillness.',
    colorBg: 'from-amber-950/20 to-stone-900/40',
    accentColor: '#D18D4D',
    recommendedProductId: 'jumbo-tealight-mogra',
    personalizedMessage: 'When the world is moving too fast, pure Mogra botanical wax brings an unhurried breath of calm.'
  },
  {
    id: 'grounded',
    label: 'Grounded',
    quote: 'I want to feel centred.',
    subtext: 'Reclaim your roots, steady your thoughts, and reconnect with the present.',
    colorBg: 'from-stone-900/30 to-amber-950/40',
    accentColor: '#B5865C',
    recommendedProductId: 'ganpati-wax-sachet',
    personalizedMessage: 'Sandalwood & Saffron creates a traditional sacred anchor for your senses and breathing space.'
  },
  {
    id: 'uplifted',
    label: 'Uplifted',
    quote: 'I need a little energy.',
    subtext: 'Awaken quiet clarity, gentle motivation, and clear headspace.',
    colorBg: 'from-amber-900/20 to-yellow-950/30',
    accentColor: '#E09E5C',
    recommendedProductId: 'sunflower-wax-sachet',
    personalizedMessage: 'Bright Ylang Ylang botanical essence invites cheerful lightness and positive renewal.'
  },
  {
    id: 'sleepy',
    label: 'Sleepy',
    quote: 'I want to switch off.',
    subtext: 'Transition smoothly from a busy day into quiet, restful rest.',
    colorBg: 'from-stone-950/40 to-amber-950/50',
    accentColor: '#9E6D47',
    recommendedProductId: 'golden-foil-wax-sachet',
    personalizedMessage: 'Deep Oudh & Amber notes softly dim the evening thoughts and welcome restorative stillness.'
  },
  {
    id: 'sensual',
    label: 'Sensual',
    quote: 'I want warmth and intimacy.',
    subtext: 'Cultivate an intimate sanctuary, soft comfort, and gentle presence.',
    colorBg: 'from-rose-950/20 to-amber-950/40',
    accentColor: '#C47253',
    recommendedProductId: 'peony-bloom',
    personalizedMessage: 'Soft layered peony petals create an intimate, velvety ambiance for quiet evening connections.'
  }
];

export const JOURNAL_ARTICLES = [
  {
    id: '5-morning-rituals',
    title: '5 Morning Rituals to Start Your Day with Intention',
    category: 'Rituals',
    readTime: '4 min read',
    date: 'Rituals',
    excerpt: 'Discover how small, mindful practices can transform your mornings from chaotic to calm.',
    content: `The way we start our mornings sets the tone for the entire day. In a world of constant notifications and rushing, creating intentional morning rituals can be transformative.

1. Wake Without the Phone
Give yourself at least 30 minutes before reaching for your device. Let your mind ease into the day naturally, without the immediate flood of information.

2. Light a Candle During Your Morning Routine
Whether it's during meditation, journaling, or your first cup of tea, the gentle glow and natural scent of a candle creates a sanctuary moment. Try our Jasmine & Sage for a calming start.

3. Practice Gratitude
Before your feet touch the floor, think of three things you're grateful for. This simple practice shifts your mindset toward positivity.`
  },
  {
    id: 'science-of-scent',
    title: 'The Science of Scent: How Fragrance Affects Your Mood',
    category: 'Wellness',
    readTime: '5 min read',
    date: 'Wellness',
    excerpt: 'Exploring the powerful connection between what we smell and how we feel.',
    content: `Our sense of smell is directly connected to the limbic system — the part of the brain that processes emotions and memories. This explains why certain scents can instantly transport us to a specific moment or evoke powerful feelings.

Lavender and Calm
Lavender has long been embraced for quiet relaxation and evening wind-down rituals. It's no wonder this scent has been cherished for centuries in aromatic traditions.

Citrus and Energy
Bright, citrus notes like bergamot and orange offer a crisp, refreshing presence to lift the mood during afternoon pauses.

Sandalwood and Grounding
Woody, earthy scents evoke feeling rooted and present. Sandalwood in particular is revered for its warm depth and contemplative ambiance.`
  },
  {
    id: 'indian-botanicals',
    title: 'Indian Botanicals: A Journey Through Scent',
    category: 'Heritage',
    readTime: '6 min read',
    date: 'Heritage',
    excerpt: 'From Mysore sandalwood to Kannauj rose, exploring India\'s aromatic treasures.',
    content: `India has been a cradle of aromatic traditions for millennia. From ancient Ayurvedic practices to the perfume markets of Kannauj, the subcontinent's relationship with scent runs deep.

Mysore Sandalwood
Considered the finest in the world, Mysore sandalwood has a rich, creamy scent that has been treasured for over 4,000 years. It's used in temples, meditation practices, and traditional perfumery.

Kannauj Rose
The small town of Kannauj in Uttar Pradesh has been distilling rose attar for over 400 years. Using traditional copper vessels called deg and bhapka, artisans create rose essences that rival French perfumes.

Jasmine from Tamil Nadu
Known as "Madurai Malli," the jasmine from Tamil Nadu has an intoxicatingly sweet scent that's central to South Indian culture — from temple offerings to hair adornments.`
  },
  {
    id: 'candle-care-guide',
    title: 'The Ultimate Guide to Candle Care',
    category: 'Tips',
    readTime: '4 min read',
    date: 'Tips',
    excerpt: 'Expert tips to maximize burn time and get the most from your candles.',
    content: `A well-cared-for candle doesn't just last longer — it burns cleaner, releases more fragrance, and becomes a more beautiful ritual object. Here's how to get the most from every flame.

The First Burn Matters
Allow your candle to burn until the wax melts evenly to the edges. This prevents "tunneling" — that frustrating ring of unused wax around the edges. For our 200g candles, this takes about 2-3 hours.

Trim the Wick
Before each burn, trim your wick to about 5mm. This prevents smoking, reduces soot, and ensures a cleaner, more even flame.

Know When to Stop
Stop burning when about 1cm of wax remains. This prevents the vessel from overheating and ensures a safe end to your candle's life.`
  },
  {
    id: 'zero-waste-packaging',
    title: 'Our Journey to Zero-Waste Packaging',
    category: 'Sustainability',
    readTime: '4 min read',
    date: 'Sustainability',
    excerpt: 'How we\'re reducing our environmental impact, one candle at a time.',
    content: `When we started The Calm Flame, we knew that sustainability couldn't be an afterthought. Every beautiful candle should come with an equally beautiful commitment to our planet.

Reusable Vessels
Our candle vessels are designed to live on. Once your candle is finished, clean out the remaining wax and repurpose it as a planter, makeup brush holder, or storage container.

No Plastic, Ever
From our FSC-certified boxes to our tissue paper printed with soy-based inks, we've eliminated plastic from our entire packaging chain.

Carbon-Conscious Shipping
We consolidate shipments, use recycled packaging materials, and are working toward carbon-neutral delivery. It's a journey, and we're committed to getting better every day.`
  },
  {
    id: 'calming-evening-ritual',
    title: 'Creating a Calming Evening Ritual',
    category: 'Rituals',
    readTime: '5 min read',
    date: 'Rituals',
    excerpt: 'Wind down your day with these simple practices for better sleep.',
    content: `As the day winds down, our bodies and minds need signals to transition from the busyness of life into restful sleep. Creating an evening ritual is one of the most powerful things you can do for your wellbeing.

Digital Sunset
Set a time each evening when screens go off. The blue light from devices suppresses melatonin production. Try replacing screen time with a book, gentle stretching, or quiet conversation.

The Power of Scent
Light a calming candle an hour before bed. Our Sandalwood & Rose or Lotus & Cardamom are perfect for evening wind-downs. The consistent scent becomes a signal to your brain that it's time to relax.

Reflection Practice
Spend 5 minutes reviewing your day. What went well? What are you grateful for? This simple practice helps process the day and prevents rumination that can interfere with sleep.`
  }
];
