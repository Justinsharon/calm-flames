import { CandleRitual } from '../types';

export interface FlameMatchResponse {
  productId: string;
  productName: string;
  reason: string;
  ritual: CandleRitual;
  poweredBy: 'gemini' | 'deterministic';
}

export interface GeneratedRitual {
  id?: string;
  title: string;
  duration: string;
  context: string;
  steps: string[];
  mantra?: string;
}

export interface AssistantResponse {
  reply: string;
  suggestedProducts: string[];
}

export interface GiftFinderResponse {
  productId: string;
  productName: string;
  giftMessage: string;
  price?: number;
}

export const aiService = {
  /**
   * AI-powered Find Your Flame discovery
   */
  async getFlameMatch(answers: {
    feeling: string;
    moment: string;
    scentPreference: string;
    intensity: string;
  }): Promise<FlameMatchResponse> {
    try {
      const res = await fetch('/api/ai/find-flame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('AI Find Flame fallback to local:', e);
    }

    // Local graceful fallback
    return {
      productId: 'jumbo-tealight-mogra',
      productName: 'Jumbo Tealight - Mogra',
      reason: 'A soft, grounding botanical match designed to help release the day and create quiet presence.',
      ritual: {
        bestTime: 'Evening unwind',
        setTheMood: 'Dim bright lights, draw curtains, and enjoy quiet stillness.',
        steps: [
          'Light your candle deliberately with a match strike.',
          'Put your phone in another room.',
          'Take three slow belly breaths as the flame steadies.',
          'Give yourself ten quiet minutes to settle your thoughts.'
        ],
        mantra: 'The day is done. I allow the world to soften.'
      },
      poweredBy: 'deterministic'
    };
  },

  /**
   * Generates a custom mindful ritual for a candle
   */
  async generateRitual(productId: string, duration: string, context: string): Promise<GeneratedRitual> {
    try {
      const res = await fetch('/api/ai/ritual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, duration, context })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('AI Ritual Generator fallback:', e);
    }

    return {
      title: `${duration} Mindful Candle Pause`,
      duration,
      context,
      steps: [
        'Place your candle on a heat-safe flat surface.',
        'Light the wick with intention.',
        'Breathe in the botanical aromas for 4 deep counts.',
        'Spend the remaining time in peaceful, screen-free presence.'
      ],
      mantra: 'I welcome warmth, tenderness, and stillness into my space.'
    };
  },

  /**
   * Concierge chat assistant
   */
  async askAssistant(message: string): Promise<AssistantResponse> {
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('AI Assistant error:', e);
    }

    return {
      reply: 'The Calm Flame handcrafts candles rooted in India\'s botanical heritage to create quiet moments in your home.',
      suggestedProducts: ['jumbo-tealight-mogra', 'royal-urli']
    };
  },

  /**
   * Smart Gift Finder
   */
  async findGift(recipient: string, occasion: string, feeling: string): Promise<GiftFinderResponse> {
    try {
      const res = await fetch('/api/ai/gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, occasion, feeling })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Gift Finder error:', e);
    }

    return {
      productId: 'ganpati-bappa-hamper',
      productName: 'Ganpati Bappa Hamper',
      giftMessage: `A thoughtful gift for your ${recipient} on this ${occasion}, wishing them moments of gentle ${feeling.toLowerCase()}.`
    };
  }
};
