import React, { useState } from 'react';
import { X, Sparkles, ArrowRight, RotateCcw, Flame, Check, ShoppingBag } from 'lucide-react';
import { Product } from '../../types';
import { getRecommendationFromQuiz } from '../../services/recommendationEngine';
import { useCart } from '../../context/CartContext';
import confetti from 'canvas-confetti';

interface FindYourFlameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
}

const QUESTIONS = [
  {
    step: 1,
    title: 'How are you feeling right now?',
    subtitle: 'Check in with your body and emotional state without judgment.',
    options: [
      { label: 'Stressed', sub: 'Tension in shoulders, fast thoughts' },
      { label: 'Tired', sub: 'Low energy, craving deep rest' },
      { label: 'Restless', sub: 'Scattered attention, seeking focus' },
      { label: 'Happy', sub: 'Grounded, looking to celebrate presence' },
      { label: 'Unmotivated', sub: 'Need gentle clarity & morning reset' },
      { label: 'I just want some me-time', sub: 'Uncompromising boundary for self-care' }
    ]
  },
  {
    step: 2,
    title: 'What kind of moment are you creating?',
    subtitle: 'Where will this candle live in your routine?',
    options: [
      { label: 'Evening unwind', sub: 'Shutting down work & dimming lights' },
      { label: 'Morning reset', sub: 'Sunrise contemplation & fresh intention' },
      { label: 'Reading', sub: 'Cozy silence with a beloved book' },
      { label: 'Meditation', sub: 'Breathwork, stillness & grounding' },
      { label: 'Bath', sub: 'Warm water, steamy botanical sanctuary' },
      { label: 'Date night', sub: 'Warm intimacy & heartfelt conversation' },
      { label: 'Gifting', sub: 'Mindful stillness for someone I cherish' }
    ]
  },
  {
    step: 3,
    title: 'What kind of scent speaks to you?',
    subtitle: 'Select the botanical family that naturally draws your senses.',
    options: [
      { label: 'Herbal', sub: 'Wild crushed sage, fresh lavender, green dew' },
      { label: 'Floral', sub: 'Night-blooming jasmine, dewy rose petals' },
      { label: 'Woody', sub: 'Mysore sandalwood, cedarwood, sacred bark' },
      { label: 'Fresh', sub: 'Bergamot zest, clean air, crisp botanicals' },
      { label: 'Warm', sub: 'Golden amber, sweet cardamom, cashmere' },
      { label: 'Sweet', sub: 'Soft floral nectar, velvety vanilla undertones' }
    ]
  },
  {
    step: 4,
    title: 'What fragrance intensity do you prefer?',
    subtitle: 'Choose how you want the room to fill with aroma.',
    options: [
      { label: 'Soft', sub: 'Whisper-quiet, subtle ambient presence' },
      { label: 'Balanced', sub: 'Noticeable yet calming, perfect for bedrooms' },
      { label: 'Rich', sub: 'Enveloping, deep throws that scent the whole room' }
    ]
  }
];

export const FindYourFlameModal: React.FC<FindYourFlameModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState({
    feeling: '',
    moment: '',
    scentPreference: '',
    intensity: ''
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const { addToCart } = useCart();

  if (!isOpen) return null;

  const currentQuestion = QUESTIONS[currentStep - 1];

  const handleSelectOption = (optionLabel: string) => {
    let updatedAnswers = { ...answers };
    if (currentStep === 1) updatedAnswers.feeling = optionLabel;
    if (currentStep === 2) updatedAnswers.moment = optionLabel;
    if (currentStep === 3) updatedAnswers.scentPreference = optionLabel;
    if (currentStep === 4) updatedAnswers.intensity = optionLabel;

    setAnswers(updatedAnswers);

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsCompleted(true);
      // Confetti burst for mindful discovery celebration
      try {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#D18D4D', '#E5DCCE', '#FAF7F2', '#A45532']
        });
      } catch (e) {
        // ignore if canvas not supported
      }
    }
  };

  const handleRestart = () => {
    setCurrentStep(1);
    setAnswers({
      feeling: '',
      moment: '',
      scentPreference: '',
      intensity: ''
    });
    setIsCompleted(false);
  };

  const result = isCompleted
    ? getRecommendationFromQuiz(answers)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D18D4D]" />
            <span className="text-xs uppercase tracking-widest font-semibold text-[#65412E]">
              Find Your Flame · Discovery Ritual
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
          {!isCompleted ? (
            <div className="space-y-6">
              {/* Progress Steps Indicator */}
              <div className="flex items-center justify-between text-xs text-[#79716B] border-b border-[#E5DCCE] pb-3">
                <span>Step {currentStep} of 4</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        step === currentStep
                          ? 'w-6 bg-[#D18D4D]'
                          : step < currentStep
                          ? 'w-3 bg-[#65412E]'
                          : 'w-3 bg-[#E5DCCE]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Question Header */}
              <div className="space-y-1.5 text-center sm:text-left">
                <h3 className="text-2xl sm:text-3xl font-serif text-[#1F1B18] tracking-tight">
                  {currentQuestion.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#79716B]">
                  {currentQuestion.subtitle}
                </p>
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleSelectOption(opt.label)}
                    className="p-4 rounded-xl border border-[#E5DCCE] bg-[#FAF7F2] hover:bg-[#F2ECE1] hover:border-[#D18D4D] text-left transition-all duration-200 group flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-[#1F1B18] group-hover:text-[#9E6D47] transition-colors">
                        {opt.label}
                      </span>
                      <ArrowRight className="w-4 h-4 text-[#D18D4D] opacity-0 group-hover:opacity-100 transform -translate-x-1 group-hover:translate-x-0 transition-all" />
                    </div>
                    <span className="text-xs text-[#79716B] leading-relaxed">
                      {opt.sub}
                    </span>
                  </button>
                ))}
              </div>

              {/* Navigation Back button if beyond step 1 */}
              {currentStep > 1 && (
                <div className="pt-2 text-left">
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="text-xs text-[#79716B] hover:text-[#1F1B18] transition-colors"
                  >
                    &larr; Back to previous question
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Result Screen */
            result && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-1">
                  <span className="text-xs uppercase tracking-widest text-[#D18D4D] font-semibold">
                    Your Personalized Match
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-serif text-[#1F1B18]">
                    Your Calm Flame
                  </h3>
                </div>

                {/* Primary Card */}
                <div className="bg-[#F2ECE1] border border-[#E5DCCE] rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                  <div className="sm:col-span-5 relative aspect-[4/3] rounded-xl overflow-hidden bg-stone-100 border border-[#E5DCCE]">
                    <img
                      src={result.primary.image}
                      alt={result.primary.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-2.5 py-0.5 rounded-full backdrop-blur-xs font-medium">
                      ₹{result.primary.price}
                    </div>
                  </div>

                  <div className="sm:col-span-7 space-y-3">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9E6D47]">
                        {result.primary.scentFamily} · {result.primary.burnTime}
                      </span>
                      <h4 className="text-xl sm:text-2xl font-serif font-bold text-[#1F1B18]">
                        {result.primary.name}
                      </h4>
                    </div>

                    <p className="text-xs sm:text-sm text-[#65412E] leading-relaxed">
                      {result.matchReason}
                    </p>

                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {(result.primary.howItFeels || ['Calm', 'Serene']).map((feel) => (
                        <span
                          key={feel}
                          className="text-[10px] bg-[#FAF7F2] text-[#79716B] px-2 py-0.5 rounded border border-[#E5DCCE]"
                        >
                          {feel}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recommended Ritual Preview */}
                <div className="p-4 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1F1B18]">
                    <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Recommended Ritual for {answers.moment || 'Your Space'}</span>
                  </div>
                  <ul className="text-xs text-[#65412E] space-y-1.5">
                    {result.recommendedRitual.steps.map((st, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#E5DCCE] text-[#1F1B18] font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTAs */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <button
                    onClick={handleRestart}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[#79716B] hover:text-[#1F1B18] transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Start Again</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    {result.primary.priceStatus !== 'missing' && result.primary.price > 0 && (
                      <button
                        onClick={() => {
                          addToCart(result.primary, 1);
                          onClose();
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-[#4A2F22] hover:text-[#1F1B18] bg-[#F2ECE1] hover:bg-[#E5DCCE] rounded-full border border-[#DBC4A9] transition-all"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-[#9E6D47]" />
                        <span>Add to Bag</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        onSelectProduct(result.primary);
                        onClose();
                      }}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full transition-all shadow-sm"
                    >
                      <span>Explore {result.primary.name}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
