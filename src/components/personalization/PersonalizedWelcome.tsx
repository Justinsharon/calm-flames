import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Product } from '../../types';
import { Sparkles, ArrowRight, Heart, Award, Flame } from 'lucide-react';

interface PersonalizedWelcomeProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onOpenAccount: () => void;
  onOpenDiscovery: () => void;
}

export const PersonalizedWelcome: React.FC<PersonalizedWelcomeProps> = ({
  products,
  onSelectProduct,
  onOpenAccount,
  onOpenDiscovery
}) => {
  const { user, profile } = useAuth();

  if (!user || !profile) return null;

  const preferredMoods = profile.preferences?.preferredMoods || ['calm'];
  const preferredScents = profile.preferences?.preferredScents || ['Herbal'];

  // Select 1-2 curated products based on customer preferences
  const pickedProducts = products.filter((p) =>
    p.moods.some((m) => preferredMoods.includes(m)) ||
    (p.scentFamily && preferredScents.includes(p.scentFamily))
  ).slice(0, 2);

  const displayProducts = pickedProducts.length > 0 ? pickedProducts : products.slice(0, 2);

  return (
    <section className="bg-[#F2ECE1]/50 border-b border-[#E5DCCE] py-10 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#FAF7F2] rounded-3xl border border-[#E5DCCE] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DCCE] pb-5">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                Personalized Sanctuary
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-[#1F1B18] tracking-tight">
                Welcome back, {profile.fullName.split(' ')[0]}.
              </h2>
              <p className="text-xs sm:text-sm text-[#79716B] mt-1">
                Ready to create another calm moment? Here are rituals attuned to your preferences.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onOpenAccount}
                className="px-4 py-2 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-xs font-semibold rounded-full border border-[#DBC4A9] transition-colors flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-[#D18D4D]" />
                <span>My Rewards & Rituals</span>
              </button>
              <button
                onClick={onOpenDiscovery}
                className="px-4 py-2 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-full transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Flame className="w-3.5 h-3.5 text-[#D18D4D]" />
                <span>Find Your Flame</span>
              </button>
            </div>
          </div>

          {/* Picked for You Cards */}
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#79716B] block mb-3">
              Picked For You · Based on your {preferredMoods[0] || 'calm'} & {preferredScents[0] || 'botanical'} preferences
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => onSelectProduct(prod)}
                  className="p-4 rounded-2xl bg-white border border-[#E5DCCE] hover:border-[#D18D4D] cursor-pointer transition-all flex gap-4 items-center group shadow-2xs"
                >
                  <img
                    src={prod.image}
                    alt={prod.name}
                    className="w-20 h-20 rounded-xl object-cover bg-stone-100 group-hover:scale-105 transition-transform shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-base font-serif font-bold text-[#1F1B18] group-hover:text-[#9E6D47] transition-colors">
                        {prod.name}
                      </h4>
                      <span className="text-xs font-bold font-sans text-[#1F1B18]">₹{prod.price}</span>
                    </div>
                    <p className="text-xs text-[#79716B] line-clamp-1">{prod.tagline}</p>
                    <div className="pt-1 flex items-center justify-between text-[11px] text-[#9E6D47] font-medium">
                      <span>Explore this ritual &rarr;</span>
                      <span className="text-[#79716B] text-[10px]">{prod.scentFamily}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
