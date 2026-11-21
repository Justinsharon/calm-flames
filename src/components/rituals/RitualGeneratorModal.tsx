import React, { useState } from 'react';
import { X, Sparkles, Flame, Clock, CheckCircle2, Bookmark, ArrowRight, RotateCcw } from 'lucide-react';
import { Product } from '../../types';
import { aiService, GeneratedRitual } from '../../services/aiService';
import { ritualsService } from '../../services/ritualsService';
import { rewardsService } from '../../services/rewardsService';
import { useAuth } from '../../context/AuthContext';

interface RitualGeneratorModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const DURATIONS = ['5 minutes', '10 minutes', '20 minutes'];
const CONTEXTS = [
  'Evening unwind',
  'Morning reset',
  'Reading',
  'Warm bath',
  'Journaling',
  'Meditation',
  'Self-care sanctuary'
];

export const RitualGeneratorModal: React.FC<RitualGeneratorModalProps> = ({
  product,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const [selectedDuration, setSelectedDuration] = useState('10 minutes');
  const [selectedContext, setSelectedContext] = useState('Evening unwind');
  const [isGenerating, setIsGenerating] = useState(false);
  const [ritualResult, setRitualResult] = useState<GeneratedRitual | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen || !product) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSavedSuccess(false);
    try {
      const result = await aiService.generateRitual(product.id, selectedDuration, selectedContext);
      setRitualResult(result);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToAccount = async () => {
    if (!user || !ritualResult) return;
    await ritualsService.saveRitual(user.uid, product.id, product.name, ritualResult);
    // Award 20 Calm Points for completing/saving ritual
    await rewardsService.awardPoints(user.uid, 20, `Created ${ritualResult.title}`);
    setSavedSuccess(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DCCE]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F1B18]">
              Create My Ritual · {product.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!ritualResult ? (
          /* Step 1: Duration & Setting Selection */
          <div className="space-y-5">
            <div className="space-y-1">
              <h4 className="text-xl font-serif font-bold text-[#1F1B18]">
                Design your mindful moment with {product.name}.
              </h4>
              <p className="text-xs text-[#79716B]">
                Tell us how much time you have and your current setting. We'll generate a bespoke step-by-step ritual.
              </p>
            </div>

            {/* Duration Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                1. Duration
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {DURATIONS.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setSelectedDuration(dur)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                      selectedDuration === dur
                        ? 'bg-[#2A2521] text-white border-[#2A2521] shadow-xs'
                        : 'bg-white text-[#65412E] border-[#DBC4A9] hover:border-[#1F1B18]'
                    }`}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                2. Setting & Intention
              </label>
              <div className="flex flex-wrap gap-2">
                {CONTEXTS.map((ctx) => (
                  <button
                    key={ctx}
                    type="button"
                    onClick={() => setSelectedContext(ctx)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      selectedContext === ctx
                        ? 'bg-[#D18D4D] text-white border-[#D18D4D] shadow-xs'
                        : 'bg-white text-[#65412E] border-[#DBC4A9] hover:border-[#D18D4D]'
                    }`}
                  >
                    {ctx}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3.5 px-4 bg-[#2A2521] hover:bg-[#4A2F22] disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              {isGenerating ? (
                <span>Composing your ritual...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#D18D4D]" />
                  <span>Generate Ritual ({selectedDuration})</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Generated Result */
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="bg-[#F2ECE1]/70 p-5 rounded-2xl border border-[#DBC4A9] space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-semibold text-[#9E6D47] uppercase tracking-wider">
                  {ritualResult.duration} · {ritualResult.context}
                </span>
                <span className="text-[10px] bg-white px-2 py-0.5 rounded-md border border-[#E5DCCE] text-[#79716B]">
                  {product.name}
                </span>
              </div>

              <h4 className="text-xl font-serif font-bold text-[#1F1B18]">
                {ritualResult.title}
              </h4>

              <ol className="space-y-2 text-xs text-[#65412E] pt-1">
                {ritualResult.steps.map((st, i) => (
                  <li key={i} className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-[#E5DCCE]">
                    <span className="w-4 h-4 rounded-full bg-[#E5DCCE] text-[#1F1B18] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{st}</span>
                  </li>
                ))}
              </ol>

              {ritualResult.mantra && (
                <div className="pt-2 text-xs italic text-[#9E6D47] border-t border-[#E5DCCE]/80">
                  <strong>Centering Mantra:</strong> "{ritualResult.mantra}"
                </div>
              )}
            </div>

            {savedSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Ritual saved to My Calm Flame (+20 Calm Points earned!)</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => setRitualResult(null)}
                className="px-4 py-2 text-xs text-[#79716B] hover:text-[#1F1B18] flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Customize Again</span>
              </button>

              <div className="flex items-center gap-2">
                {user ? (
                  <button
                    onClick={handleSaveToAccount}
                    disabled={savedSuccess}
                    className="px-4 py-2.5 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-xs font-semibold rounded-xl border border-[#DBC4A9] flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>{savedSuccess ? 'Saved' : 'Save to My Rituals'}</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[#79716B]">Sign in to save rituals</span>
                )}

                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-[#2A2521] text-white text-xs font-semibold rounded-xl hover:bg-[#4A2F22] transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
