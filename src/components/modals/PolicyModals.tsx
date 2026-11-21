import React, { useState } from 'react';
import { X, Mail, Phone, MapPin, Clock, Check, Sparkles, ShieldCheck } from 'lucide-react';

export type PolicyModalType =
  | 'faq'
  | 'candle-care'
  | 'shipping-policy'
  | 'refund-policy'
  | 'contact'
  | 'ingredients'
  | 'sustainability'
  | 'stockists';

interface PolicyModalsProps {
  activeType: PolicyModalType | null;
  onClose: () => void;
}

export const PolicyModals: React.FC<PolicyModalsProps> = ({ activeType, onClose }) => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  if (!activeType) return null;

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactName && contactEmail && contactMessage) {
      setContactSubmitted(true);
    }
  };

  const getTitle = () => {
    switch (activeType) {
      case 'faq':
        return 'Frequently Asked Questions';
      case 'candle-care':
        return 'Candle Care';
      case 'shipping-policy':
        return 'Shipping Policy';
      case 'refund-policy':
        return 'Refund & Returns Policy';
      case 'contact':
        return 'Contact Us';
      case 'ingredients':
        return 'Our Ingredients';
      case 'sustainability':
        return 'Sustainability';
      case 'stockists':
        return 'Wholesale Enquiries';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/70">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F1B18]">
              {getTitle()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-sm text-[#4A2F22] leading-relaxed">
          {/* FAQ */}
          {activeType === 'faq' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">FAQs</h4>
                <p className="text-xs text-[#9E6D47]">
                  Everything you need to know about The Calm Flame.
                </p>
              </div>

              <div className="space-y-5 divide-y divide-[#E5DCCE]/70 pt-2">
                <div className="pt-3 space-y-1.5">
                  <h5 className="font-semibold text-[#1F1B18] text-sm">
                    What makes The Calm Flame candles unique?
                  </h5>
                  <p className="text-xs text-[#65412E] leading-relaxed">
                    Each candle is thoughtfully handcrafted, inspired by India's botanical heritage—designed to create a calming ritual in your home.
                  </p>
                </div>

                <div className="pt-3 space-y-1.5">
                  <h5 className="font-semibold text-[#1F1B18] text-sm">
                    Are your candles made with natural ingredients?
                  </h5>
                  <p className="text-xs text-[#65412E] leading-relaxed">
                    Yes. We use plant-based wax and carefully selected botanical aromas to ensure a clean, mindful burn.
                  </p>
                </div>

                <div className="pt-3 space-y-1.5">
                  <h5 className="font-semibold text-[#1F1B18] text-sm">
                    How should I use my candle for the best experience?
                  </h5>
                  <p className="text-xs text-[#65412E] leading-relaxed">
                    Allow the wax to melt evenly on the first burn, trim the wick before each use, and avoid burning for more than 3–4 hours at a time.
                  </p>
                </div>

                <div className="pt-3 space-y-1.5">
                  <h5 className="font-semibold text-[#1F1B18] text-sm">
                    Do you offer returns or exchanges?
                  </h5>
                  <p className="text-xs text-[#65412E] leading-relaxed">
                    We accept returns for unused and unopened products within 7 days of delivery. For more details, please refer to our Refund Policy.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Candle Care */}
          {activeType === 'candle-care' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Candle Care</h4>
                <p className="text-xs text-[#9E6D47]">
                  A few mindful practices for the best experience.
                </p>
                <p className="text-xs text-[#65412E] pt-2">
                  To ensure the best experience from your The Calm Flame candle, a few mindful practices can make all the difference.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>✨</span>
                    <span>First Burn Matters</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Allow the wax to melt evenly across the surface to prevent tunneling and ensure a consistent burn.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>✂️</span>
                    <span>Trim the Wick</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Keep the wick trimmed to about ¼ inch before each use for a clean, steady flame.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>⏱️</span>
                    <span>Burn with Intention</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Avoid burning your candle for more than 3–4 hours at a time to preserve its quality and fragrance.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>🏠</span>
                    <span>Create a Safe Space</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Place your candle on a stable, heat-resistant surface and away from drafts, pets, and flammable objects.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>⚠️</span>
                    <span>Know When to Pause</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Discontinue use when about ½ inch of wax remains to ensure safety.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Shipping Policy */}
          {activeType === 'shipping-policy' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Shipping Policy</h4>
                <p className="text-xs text-[#9E6D47]">
                  Everything you need to know about how we deliver calm to your doorstep.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <h5 className="font-semibold text-[#1F1B18] text-xs uppercase tracking-wider mb-2">
                    Domestic Shipping (India)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#F2ECE1]/50 p-3 rounded-xl border border-[#E5DCCE]">
                      <div className="text-base mb-1">🚚</div>
                      <div className="font-semibold text-[#1F1B18]">Free Shipping</div>
                      <p className="text-[11px] text-[#65412E]">On all orders above ₹1,500</p>
                    </div>
                    <div className="bg-[#F2ECE1]/50 p-3 rounded-xl border border-[#E5DCCE]">
                      <div className="text-base mb-1">📦</div>
                      <div className="font-semibold text-[#1F1B18]">Standard Shipping</div>
                      <p className="text-[11px] text-[#65412E]">₹99 for orders below ₹1,500</p>
                    </div>
                    <div className="bg-[#F2ECE1]/50 p-3 rounded-xl border border-[#E5DCCE]">
                      <div className="text-base mb-1">⏱️</div>
                      <div className="font-semibold text-[#1F1B18]">Delivery Time</div>
                      <p className="text-[11px] text-[#65412E]">5-7 business days across India</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2 text-xs text-[#65412E]">
                  <div>
                    <h6 className="font-semibold text-[#1F1B18] mb-1">Processing Time</h6>
                    <p>All orders are processed within 1-2 business days. Orders placed on weekends or holidays will be processed the next business day.</p>
                  </div>
                  <div>
                    <h6 className="font-semibold text-[#1F1B18] mb-1">Tracking Your Order</h6>
                    <p>Once your order ships, you will receive an email with tracking information. You can track your package using the provided tracking number.</p>
                  </div>
                  <div>
                    <h6 className="font-semibold text-[#1F1B18] mb-1">Shipping Partners</h6>
                    <p>We work with trusted logistics partners including Delhivery, BlueDart, and India Post to ensure safe and timely delivery of your candles.</p>
                  </div>
                  <div>
                    <h6 className="font-semibold text-[#1F1B18] mb-1">Packaging</h6>
                    <p>Each candle is carefully packaged in eco-friendly materials to ensure it arrives safely. Our packaging is designed to protect your candles during transit while minimizing environmental impact.</p>
                  </div>
                  <div>
                    <h6 className="font-semibold text-[#1F1B18] mb-1">Contact Us</h6>
                    <p>For shipping-related queries, please email us at mail@thecalmflames.com or call us at +91 9663995025.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Refund & Returns Policy */}
          {activeType === 'refund-policy' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Refund &amp; Returns Policy</h4>
                <p className="text-xs text-[#9E6D47]">
                  Our commitment to your satisfaction, handled with care.
                </p>
              </div>

              <p className="text-xs text-[#65412E]">
                At The Calm Flame, each candle is carefully handcrafted with intention and care. Due to the nature of our products, we maintain a thoughtful returns and refund process.
              </p>

              <div className="space-y-3 text-xs text-[#65412E]">
                <div className="bg-[#F2ECE1]/50 p-3.5 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <h6 className="font-semibold text-[#1F1B18]">Returns</h6>
                  <p>We accept returns within 7 days of delivery, provided that:</p>
                  <ul className="list-disc pl-5 space-y-0.5 pt-1">
                    <li>The product is unused, unopened, and in its original packaging</li>
                    <li>The item is in the same condition as received</li>
                  </ul>
                  <p className="pt-1">To initiate a return, please email us at thecalmflames@gmail.com with your order details.</p>
                </div>

                <div className="bg-[#F2ECE1]/50 p-3.5 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <h6 className="font-semibold text-[#1F1B18]">Refunds</h6>
                  <p>Once your return is received and inspected: You will be notified of the approval or rejection of your refund. If approved, refunds will be processed within 5–7 business days. The amount will be credited to your original method of payment.</p>
                </div>

                <div className="bg-[#F2ECE1]/50 p-3.5 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <h6 className="font-semibold text-[#1F1B18]">Damaged or Incorrect Orders</h6>
                  <p>If you receive a damaged or incorrect product, please contact us within 48 hours of delivery with your order number and clear images of the product. We will arrange a replacement or refund at no additional cost.</p>
                </div>

                <div className="bg-[#F2ECE1]/50 p-3.5 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <h6 className="font-semibold text-[#1F1B18]">Non-Returnable Items</h6>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>Used or opened candles</li>
                    <li>Products without original packaging</li>
                    <li>Items returned after the 7-day window</li>
                  </ul>
                </div>

                <div className="bg-[#F2ECE1]/50 p-3.5 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <h6 className="font-semibold text-[#1F1B18]">Shipping Costs</h6>
                  <p>Return shipping costs are to be borne by the customer unless the product is damaged or incorrect. Original shipping charges are non-refundable.</p>
                </div>
              </div>
            </div>
          )}

          {/* Contact Us */}
          {activeType === 'contact' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Contact Us</h4>
                <p className="text-xs text-[#9E6D47]">
                  We'd love to hear from you. Reach out with questions, feedback, or just to say hello.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-[#F2ECE1]/50 rounded-xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <Mail className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Email</span>
                  </div>
                  <a href="mailto:mail@thecalmflames.com" className="text-[#9E6D47] hover:underline block">
                    mail@thecalmflames.com
                  </a>
                </div>

                <div className="p-3 bg-[#F2ECE1]/50 rounded-xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <Phone className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Phone</span>
                  </div>
                  <p className="text-[#65412E]">+91 9663995025</p>
                </div>

                <div className="p-3 bg-[#F2ECE1]/50 rounded-xl border border-[#E5DCCE] space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <MapPin className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Studio</span>
                  </div>
                  <p className="text-[#65412E] leading-relaxed">
                    91 Prasidhi Park Vista, Hesaraghatta Hobli, Yelahanka Taluk, Adde Vishwanathapura, Arakere, Bengaluru, Karnataka – 561203
                  </p>
                </div>

                <div className="p-3 bg-[#F2ECE1]/50 rounded-xl border border-[#E5DCCE] space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[#1F1B18]">
                    <Clock className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Hours</span>
                  </div>
                  <p className="text-[#65412E]">Mon - Sat: 10am - 6pm · Sunday: Closed</p>
                </div>
              </div>

              {/* Message Form */}
              <div className="pt-2 border-t border-[#E5DCCE] space-y-3">
                <h5 className="font-semibold text-xs text-[#1F1B18] uppercase tracking-wider">
                  Send Us a Message
                </h5>
                {contactSubmitted ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-2">
                    <p className="font-semibold">Thank you for reaching out.</p>
                    <p>We'll get back to you within 24 hours. ✦</p>
                    <button
                      onClick={() => setContactSubmitted(false)}
                      className="text-emerald-900 underline font-medium text-xs pt-1 block"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Name"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="px-3 py-2 text-xs bg-white border border-[#DBC4A9] rounded-xl text-[#1F1B18] focus:outline-none focus:border-[#D18D4D]"
                      />
                      <input
                        type="email"
                        required
                        placeholder="Email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="px-3 py-2 text-xs bg-white border border-[#DBC4A9] rounded-xl text-[#1F1B18] focus:outline-none focus:border-[#D18D4D]"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Subject"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DBC4A9] rounded-xl text-[#1F1B18] focus:outline-none focus:border-[#D18D4D]"
                    />
                    <textarea
                      required
                      rows={3}
                      placeholder="Message"
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#DBC4A9] rounded-xl text-[#1F1B18] focus:outline-none focus:border-[#D18D4D]"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-full transition-colors"
                    >
                      Send Message
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Our Ingredients */}
          {activeType === 'ingredients' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Our Ingredients</h4>
                <p className="text-xs text-[#9E6D47]">
                  Crafted with intention. Know exactly what goes into every flame.
                </p>
                <p className="text-xs text-[#65412E] pt-2">
                  Our candles are crafted using only the finest natural ingredients, carefully selected for quality, sustainability, and your wellbeing.
                </p>
              </div>

              <div className="space-y-3.5 pt-2">
                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>🌿</span>
                    <span>Botanical Essences & Aromas</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Inspired by India's aromatic heritage, bringing calm and subtle presence into every space.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>🕯️</span>
                    <span>Natural Plant-Based Wax</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Hand-poured for a clean, slow, and even burn.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>🌺</span>
                    <span>Botanical Extracts</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Carefully chosen to enrich the sensory experience and preserve natural aromatic character.
                  </p>
                </div>

                <div className="p-3.5 bg-[#F2ECE1]/50 rounded-2xl border border-[#E5DCCE] space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[#1F1B18] text-xs">
                    <span>🧵</span>
                    <span>Lead-Free Wicks</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Carefully selected wicks for a steady, mindful flame.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sustainability */}
          {activeType === 'sustainability' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Sustainability</h4>
                <p className="text-xs text-[#9E6D47]">
                  Mindfulness that extends beyond the flame.
                </p>
              </div>

              <div className="space-y-3 text-xs text-[#65412E] leading-relaxed">
                <p>
                  At The Calm Flame, mindfulness extends beyond the flame.
                </p>
                <p>
                  We are committed to creating products that are thoughtful and deliberate. From curated ingredients to conscious production practices, every step is taken with intention and care.
                </p>
                <p>
                  Our candles are crafted in small batches to maintain craft quality, while our packaging is designed to be minimal and reusable.
                </p>
                <p className="font-serif italic text-sm text-[#1F1B18]">
                  Because true calm should never come at the cost of the world around us.
                </p>
              </div>
            </div>
          )}

          {/* Stockists / Wholesale Enquiries */}
          {activeType === 'stockists' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="text-2xl font-serif text-[#1F1B18]">Wholesale Enquiries</h4>
                <p className="text-xs text-[#9E6D47]">
                  Partner with us in sharing calm.
                </p>
              </div>

              <div className="space-y-3 text-xs text-[#65412E] leading-relaxed">
                <p>
                  We welcome partnerships with like-minded spaces that value mindful living, thoughtful design, and elevated experiences.
                </p>
                <p>
                  The Calm Flame offers a curated range of handcrafted aromatherapy candles—ideal for boutiques, concept stores, wellness spaces, and gifting collaborations. Each piece is created with intention and rooted in India's botanical heritage.
                </p>
                <p>
                  For wholesale pricing, bulk orders, or collaboration opportunities, we invite you to get in touch with us.
                </p>
                <div className="pt-2">
                  <a
                    href="mailto:mail@thecalmflames.com"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2A2521] text-white text-xs font-semibold rounded-full hover:bg-[#4A2F22] transition-colors"
                  >
                    <span>Contact Us · mail@thecalmflames.com</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
