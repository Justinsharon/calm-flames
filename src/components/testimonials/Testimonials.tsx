import React from 'react';
import { Quote } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote: 'These candles have transformed my evening routine. The jasmine scent is so calming.',
    author: 'Priya Sharma',
    city: 'Mumbai'
  },
  {
    quote: 'Finally, a candle brand that understands the power of real botanicals. No synthetic headaches.',
    author: 'Arjun Mehta',
    city: 'Bangalore'
  },
  {
    quote: 'The packaging, the scent, the burn time — everything is thoughtful. A ritual I look forward to.',
    author: 'Meera Kapoor',
    city: 'Delhi'
  }
];

export const Testimonials: React.FC = () => {
  return (
    <section className="py-16 md:py-24 bg-[#F2ECE1]/50 border-b border-[#E5DCCE]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2 mb-12">
          <p className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold">
            Customer Reflections
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#1F1B18] tracking-tight">
            What Your Quiet Moments Say
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {TESTIMONIALS.map((t, idx) => (
            <div
              key={idx}
              className="bg-[#FAF7F2] p-6 sm:p-8 rounded-2xl border border-[#E5DCCE] shadow-sm flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                <Quote className="w-5 h-5 text-[#D18D4D]/60" />
                <p className="text-sm text-[#4A2F22] leading-relaxed font-serif italic">
                  "{t.quote}"
                </p>
              </div>

              <div className="pt-4 border-t border-[#E5DCCE]/60">
                <p className="text-xs font-semibold text-[#1F1B18]">{t.author}</p>
                <p className="text-[11px] text-[#79716B]">{t.city}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
