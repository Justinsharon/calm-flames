import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Sparkles } from 'lucide-react';

export const BreathingRitual: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<'breathe-in' | 'hold' | 'breathe-out'>('breathe-in');
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    // 4-4-4 Box Breath rhythm: 4s breathe in, 4s hold, 4s breathe out
    let timer: NodeJS.Timeout;

    if (phase === 'breathe-in') {
      timer = setTimeout(() => {
        setPhase('hold');
      }, 4000);
    } else if (phase === 'hold') {
      timer = setTimeout(() => {
        setPhase('breathe-out');
      }, 4000);
    } else if (phase === 'breathe-out') {
      timer = setTimeout(() => {
        setPhase('breathe-in');
        setCycleCount((c) => c + 1);
      }, 4000);
    }

    return () => clearTimeout(timer);
  }, [isActive, phase]);

  const handleToggle = () => {
    if (!isActive) {
      setIsActive(true);
      setPhase('breathe-in');
    } else {
      setIsActive(false);
    }
  };

  const handleReset = () => {
    setIsActive(false);
    setPhase('breathe-in');
    setCycleCount(0);
  };

  const getPhaseInstruction = () => {
    if (!isActive) return 'Begin a gentle pause';
    if (phase === 'breathe-in') return 'Breathe in slowly';
    if (phase === 'hold') return 'Hold softly';
    return 'Breathe out gently';
  };

  const getPhaseSubtext = () => {
    if (!isActive) return 'Four seconds in. Four seconds hold. Four seconds release.';
    if (phase === 'breathe-in') return 'Fill your lower lungs with quiet warmth';
    if (phase === 'hold') return 'Rest in the natural stillness at the top of the breath';
    return 'Release any accumulated tension from your shoulders';
  };

  return (
    <section id="breathing-moment" className="py-16 md:py-24 bg-[#FAF7F2] border-b border-[#E5DCCE]/60 relative overflow-hidden">
      {/* Background ambient warm hue */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#D18D4D]/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
            <span>Ambient Stillness</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight">
            Take a sixty-second breath with us.
          </h2>
          <p className="text-xs sm:text-sm text-[#79716B] max-w-md mx-auto">
            Before continuing your journey, take an optional moment to center yourself. No rush, no goals.
          </p>
        </div>

        {/* Breathing Circle Element */}
        <div className="flex flex-col items-center justify-center pt-2 pb-4">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Outer pulsating ring */}
            <div
              className={`absolute inset-0 rounded-full border border-[#D18D4D]/40 transition-all duration-[4000ms] ease-in-out ${
                isActive && phase === 'breathe-in'
                  ? 'scale-110 opacity-80 bg-gradient-to-tr from-[#D18D4D]/20 via-[#E09E5C]/15 to-transparent shadow-xl'
                  : isActive && phase === 'hold'
                  ? 'scale-110 opacity-90 bg-gradient-to-tr from-[#D18D4D]/25 via-[#E09E5C]/20 to-transparent'
                  : isActive && phase === 'breathe-out'
                  ? 'scale-90 opacity-40 bg-transparent'
                  : 'scale-95 opacity-50 bg-[#F2ECE1]/40'
              }`}
            />

            {/* Inner glowing amber orb */}
            <div
              className={`w-40 h-40 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center p-4 text-center transition-all duration-[4000ms] ease-in-out shadow-inner ${
                isActive && (phase === 'breathe-in' || phase === 'hold')
                  ? 'bg-gradient-to-br from-[#FAF7F2] to-[#F2ECE1] border-2 border-[#D18D4D] shadow-md scale-105'
                  : 'bg-[#FAF7F2] border border-[#E5DCCE] scale-95'
              }`}
            >
              {/* Inner ember dot */}
              <div
                className={`w-3 h-3 rounded-full mb-2 transition-all duration-[4000ms] ${
                  isActive ? 'bg-[#D18D4D] shadow-[0_0_12px_#D18D4D]' : 'bg-[#DBC4A9]'
                }`}
              />

              <p className="text-base sm:text-lg font-serif font-semibold text-[#1F1B18] transition-all duration-300">
                {getPhaseInstruction()}
              </p>

              {isActive && (
                <span className="text-[10px] text-[#9E6D47] font-medium tracking-widest uppercase mt-1">
                  {phase === 'hold' ? '4s' : phase === 'breathe-in' ? 'Inhaling' : 'Exhaling'}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-[#79716B] mt-4 max-w-xs transition-opacity duration-300">
            {getPhaseSubtext()}
          </p>

          {cycleCount > 0 && (
            <p className="text-[11px] text-[#9E6D47] mt-1 font-medium">
              Completed {cycleCount} mindful {cycleCount === 1 ? 'cycle' : 'cycles'}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleToggle}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-medium text-white bg-[#2A2521] hover:bg-[#4A2F22] rounded-full shadow-sm hover:shadow transition-all"
          >
            {isActive ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Breath</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Begin Breathing</span>
              </>
            )}
          </button>

          {(isActive || cycleCount > 0) && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs text-[#79716B] hover:text-[#1F1B18] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
