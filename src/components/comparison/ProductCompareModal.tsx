import React from 'react';
import { X, Sparkles, Check, ShoppingBag, ArrowRight } from 'lucide-react';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';

interface ProductCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
}

export const ProductCompareModal: React.FC<ProductCompareModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct
}) => {
  const { addToCart } = useCart();

  if (!isOpen) return null;

  // Compare the core 3 single-jar candles or all 4
  const compared = products.slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/70">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F1B18]">
              Compare Candles
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {compared.map((prod) => (
              <div
                key={prod.id}
                className="bg-white rounded-2xl border border-[#E5DCCE] p-5 flex flex-col justify-between space-y-4 shadow-2xs"
              >
                <div className="space-y-3">
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-stone-100">
                    <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#9E6D47]">
                      {prod.scentFamily}
                    </span>
                    <h4 className="text-lg font-serif font-bold text-[#1F1B18]">{prod.name}</h4>
                    <span className="text-sm font-bold font-sans text-[#1F1B18]">
                      {prod.priceStatus !== 'missing' && prod.price > 0 ? `₹${prod.price}` : 'Price Pending'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-[#65412E] border-t border-[#E5DCCE] pt-3">
                    <p><strong>Burn Time:</strong> {prod.burnTime || 'Not specified'}</p>
                    <p><strong>Weight:</strong> {prod.weight || 'Not specified'}</p>
                    <p><strong>Fragrance / Notes:</strong> {prod.fragrance || prod.scentFamily || 'Not specified'}</p>
                    {prod.ritual?.bestTime && (
                      <p><strong>Best For:</strong> {prod.ritual.bestTime}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {(prod.howItFeels || ['Calm', 'Serene']).map((f) => (
                      <span key={f} className="text-[10px] bg-[#F2ECE1] text-[#79716B] px-2 py-0.5 rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#E5DCCE]">
                  {prod.priceStatus !== 'missing' && prod.price > 0 ? (
                    <button
                      onClick={() => {
                        addToCart(prod, 1);
                      }}
                      className="w-full py-2.5 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-[#D18D4D]" />
                      <span>Add to Bag</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-2.5 bg-[#F2ECE1] text-[#79716B] text-xs font-medium rounded-xl border border-[#DBC4A9] text-center cursor-not-allowed"
                    >
                      <span>Price Pending</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onClose();
                      onSelectProduct(prod);
                    }}
                    className="w-full py-2 bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-xs font-semibold rounded-xl text-center transition-colors"
                  >
                    View Ritual
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Scent Guidance Box */}
          <div className="p-4 bg-[#F2ECE1]/70 rounded-2xl border border-[#DBC4A9] space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1F1B18]">
              <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
              <span>Which candle is right for you?</span>
            </div>
            <p className="text-xs text-[#65412E] leading-relaxed">
              If you seek delicate floral stillness, choose <strong>Jumbo Tealight - Mogra</strong>. For festive ceremonial warmth, choose <strong>Floral Lotus Urli</strong>. For sacred grounding and aromatic depth, choose <strong>Royal Urli</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
