import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

export const RitualClub: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes('@')) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <section className="py-16 md:py-24 bg-[#FAF7F2] border-b border-[#E5DCCE]/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
            The Ritual Club
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight">
            Join the Ritual
          </h2>
          <p className="text-sm sm:text-base text-[#65412E] max-w-lg mx-auto leading-relaxed">
            Get early access to new collections, seasonal scents, and calm delivered to your inbox.
          </p>
        </div>

        {subscribed ? (
          <div className="p-4 bg-[#F2ECE1] border border-[#D18D4D]/50 rounded-2xl max-w-md mx-auto text-sm text-[#4A2F22] flex items-center justify-center gap-2.5 font-medium animate-in fade-in duration-300">
            <Check className="w-4 h-4 text-[#D18D4D]" />
            <span>You're in. Welcome to the ritual. ✦</span>
          </div>
        ) : (
          <div className="space-y-3 max-w-md mx-auto">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 text-xs bg-white border border-[#DBC4A9] rounded-full text-[#1F1B18] placeholder-stone-400 focus:outline-none focus:border-[#D18D4D] shadow-xs"
              />
              <button
                type="submit"
                className="px-5 py-3 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-full transition-colors shrink-0 flex items-center gap-1.5"
              >
                <span>Light the Way</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
            <p className="text-[11px] text-[#9E6D47]">
              ✦ 10% off your first order when you subscribe
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
