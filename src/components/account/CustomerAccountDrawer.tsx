import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Heart,
  LogOut,
  MapPin,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Award,
  Bookmark,
  Share2,
  Trash2,
  Tag
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { fetchOrders } from '../../services/dbService';
import { rewardsService, CustomerRewardData, RewardTransaction } from '../../services/rewardsService';
import { ritualsService, SavedCustomerRitual } from '../../services/ritualsService';
import { OrderRecord, CustomerDetails } from '../../types';

interface CustomerAccountDrawerProps {
  onOpenAdmin: () => void;
  onExploreProducts: () => void;
}

export const CustomerAccountDrawer: React.FC<CustomerAccountDrawerProps> = ({
  onOpenAdmin,
  onExploreProducts
}) => {
  const {
    user,
    profile,
    isAdmin,
    isAccountOpen,
    setIsAccountOpen,
    signOut,
    updatePreferences,
    saveAddress
  } = useAuth();

  const { wishlist, setIsWishlistOpen } = useWishlist();

  const [activeTab, setActiveTab] = useState<'orders' | 'rituals' | 'rewards' | 'preferences' | 'address'>('orders');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  // Rewards & Rituals state
  const [rewards, setRewards] = useState<CustomerRewardData | null>(null);
  const [rewardTx, setRewardTx] = useState<RewardTransaction[]>([]);
  const [savedRituals, setSavedRituals] = useState<SavedCustomerRitual[]>([]);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);

  // Address edit state
  const [addressForm, setAddressForm] = useState<CustomerDetails>({
    fullName: profile?.fullName || '',
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    addressLine1: profile?.savedAddress?.addressLine1 || '',
    addressLine2: profile?.savedAddress?.addressLine2 || '',
    city: profile?.savedAddress?.city || '',
    state: profile?.savedAddress?.state || '',
    pincode: profile?.savedAddress?.pincode || ''
  });
  const [addressSavedMsg, setAddressSavedMsg] = useState(false);

  // Preferences state
  const [moodPrefs, setMoodPrefs] = useState<string[]>(profile?.preferences?.preferredMoods || ['calm', 'wind-down']);
  const [scentPrefs, setScentPrefs] = useState<string[]>(profile?.preferences?.preferredScents || ['Herbal', 'Woody']);
  const [intensityPref, setIntensityPref] = useState<string>(profile?.preferences?.preferredIntensity || 'Balanced');
  const [prefsSavedMsg, setPrefsSavedMsg] = useState(false);

  useEffect(() => {
    if (user && isAccountOpen) {
      setLoadingOrders(true);
      fetchOrders(user.uid)
        .then((data) => setOrders(data))
        .finally(() => setLoadingOrders(false));

      rewardsService.getCustomerRewards(user.uid).then((r) => setRewards(r));
      rewardsService.getTransactions(user.uid).then((tx) => setRewardTx(tx));
      ritualsService.getCustomerRituals(user.uid).then((rit) => setSavedRituals(rit));
    }
  }, [user, isAccountOpen]);

  useEffect(() => {
    if (profile) {
      setAddressForm({
        fullName: profile.fullName || '',
        email: profile.email || user?.email || '',
        phone: profile.phone || '',
        addressLine1: profile.savedAddress?.addressLine1 || '',
        addressLine2: profile.savedAddress?.addressLine2 || '',
        city: profile.savedAddress?.city || '',
        state: profile.savedAddress?.state || '',
        pincode: profile.savedAddress?.pincode || ''
      });
      if (profile.preferences) {
        setMoodPrefs(profile.preferences.preferredMoods || []);
        setScentPrefs(profile.preferences.preferredScents || []);
        setIntensityPref(profile.preferences.preferredIntensity || 'Balanced');
      }
    }
  }, [profile, user]);

  if (!isAccountOpen) return null;

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveAddress(addressForm);
    setAddressSavedMsg(true);
    setTimeout(() => setAddressSavedMsg(false), 3000);
  };

  const handleSavePreferences = async () => {
    await updatePreferences({
      preferredMoods: moodPrefs,
      preferredScents: scentPrefs,
      preferredIntensity: intensityPref
    });
    setPrefsSavedMsg(true);
    setTimeout(() => setPrefsSavedMsg(false), 3000);
  };

  const handleRedeemPoints = async (points: number) => {
    if (!user) return;
    const res = await rewardsService.redeemPoints(user.uid, points);
    setRedeemMsg(res.message);
    if (res.success) {
      rewardsService.getCustomerRewards(user.uid).then((r) => setRewards(r));
      rewardsService.getTransactions(user.uid).then((tx) => setRewardTx(tx));
    }
    setTimeout(() => setRedeemMsg(null), 5000);
  };

  const handleDeleteRitual = async (ritualId: string) => {
    if (!user) return;
    await ritualsService.deleteRitual(user.uid, ritualId);
    setSavedRituals((prev) => prev.filter((r) => r.id !== ritualId));
  };

  const toggleMoodPref = (m: string) => {
    setMoodPrefs((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const toggleScentPref = (s: string) => {
    setScentPrefs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-8 sm:pl-12">
        <div className="w-screen max-w-xl bg-[#FAF7F2] border-l border-[#E5DCCE] shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#2A2521] text-white flex items-center justify-center font-serif text-sm">
                {profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : 'C'}
              </div>
              <div>
                <h3 className="text-base font-serif font-bold text-[#1F1B18] tracking-tight">
                  My Calm Flame
                </h3>
                <p className="text-[11px] text-[#79716B]">
                  {profile?.fullName} · {rewards?.tier || 'Ember'} Member ({rewards?.pointsBalance || 0} pts)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => {
                    setIsAccountOpen(false);
                    onOpenAdmin();
                  }}
                  className="px-3 py-1.5 bg-[#D18D4D] text-white text-[11px] font-semibold rounded-lg hover:bg-[#C27D38] transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin Panel</span>
                </button>
              )}
              <button
                onClick={() => setIsAccountOpen(false)}
                className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 pt-3 border-b border-[#E5DCCE] flex items-center gap-1 overflow-x-auto text-xs font-medium">
            <button
              onClick={() => {
                setActiveTab('orders');
                setSelectedOrder(null);
              }}
              className={`pb-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'orders'
                  ? 'border-[#D18D4D] text-[#1F1B18] font-bold'
                  : 'border-transparent text-[#79716B] hover:text-[#1F1B18]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Orders ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('rituals')}
              className={`pb-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'rituals'
                  ? 'border-[#D18D4D] text-[#1F1B18] font-bold'
                  : 'border-transparent text-[#79716B] hover:text-[#1F1B18]'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>My Rituals ({savedRituals.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('rewards')}
              className={`pb-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'rewards'
                  ? 'border-[#D18D4D] text-[#1F1B18] font-bold'
                  : 'border-transparent text-[#79716B] hover:text-[#1F1B18]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Calm Points</span>
            </button>

            <button
              onClick={() => setActiveTab('preferences')}
              className={`pb-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'preferences'
                  ? 'border-[#D18D4D] text-[#1F1B18] font-bold'
                  : 'border-transparent text-[#79716B] hover:text-[#1F1B18]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preferences</span>
            </button>

            <button
              onClick={() => setActiveTab('address')}
              className={`pb-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'address'
                  ? 'border-[#D18D4D] text-[#1F1B18] font-bold'
                  : 'border-transparent text-[#79716B] hover:text-[#1F1B18]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Addresses</span>
            </button>

            <button
              onClick={() => {
                setIsAccountOpen(false);
                setIsWishlistOpen(true);
              }}
              className="pb-3 px-3 border-b-2 border-transparent text-[#79716B] hover:text-[#1F1B18] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Wishlist ({wishlist.length})</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* TAB: ORDERS */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {selectedOrder ? (
                  <div className="space-y-4 animate-in fade-in">
                    <button
                      onClick={() => setSelectedOrder(null)}
                      className="text-xs text-[#9E6D47] hover:underline flex items-center gap-1"
                    >
                      &larr; Back to all orders
                    </button>

                    <div className="bg-[#F2ECE1]/60 p-5 rounded-2xl border border-[#E5DCCE] space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-[#9E6D47] font-semibold">
                            Order {selectedOrder.orderId}
                          </span>
                          <p className="text-xs text-[#79716B]">{selectedOrder.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                            {selectedOrder.paymentStatus}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-200 text-[#1F1B18]">
                            {selectedOrder.status}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-[#E5DCCE] text-xs pt-2">
                        {selectedOrder.items.map((item, i) => (
                          <div key={i} className="py-2.5 flex justify-between items-center text-[#65412E]">
                            <div>
                              <p className="font-semibold text-[#1F1B18]">{item.product.name}</p>
                              <p className="text-[11px] text-[#79716B]">Qty: {item.quantity}</p>
                            </div>
                            <span className="font-semibold font-sans">₹{item.product.price * item.quantity}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-[#E5DCCE] text-xs space-y-1">
                        <div className="flex justify-between text-[#79716B]">
                          <span>Subtotal</span>
                          <span>₹{selectedOrder.subtotal}</span>
                        </div>
                        <div className="flex justify-between text-[#79716B]">
                          <span>Shipping</span>
                          <span>{selectedOrder.shipping === 0 ? 'FREE' : `₹${selectedOrder.shipping}`}</span>
                        </div>
                        <div className="flex justify-between font-bold text-sm text-[#1F1B18] pt-1">
                          <span>Total Amount</span>
                          <span>₹{selectedOrder.total}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E5DCCE] text-[11px] text-[#79716B]">
                        <p><strong>Shipping to:</strong> {selectedOrder.customer.fullName}</p>
                        <p>{selectedOrder.customer.addressLine1}, {selectedOrder.customer.city}, {selectedOrder.customer.pincode}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {loadingOrders ? (
                      <p className="text-xs text-[#79716B] text-center py-8">Loading your orders...</p>
                    ) : orders.length > 0 ? (
                      orders.map((ord) => (
                        <div
                          key={ord.orderId}
                          onClick={() => setSelectedOrder(ord)}
                          className="p-4 rounded-2xl bg-white border border-[#E5DCCE] hover:border-[#D18D4D] cursor-pointer transition-all space-y-2 shadow-2xs"
                        >
                          <div className="flex justify-between items-baseline">
                            <span className="text-xs font-bold text-[#1F1B18] font-mono">
                              {ord.orderId}
                            </span>
                            <span className="text-xs font-bold text-[#1F1B18] font-sans">
                              ₹{ord.total}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs text-[#79716B]">
                            <span>{ord.date} · {ord.items.length} {ord.items.length === 1 ? 'item' : 'items'}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                              {ord.paymentStatus}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 space-y-3">
                        <Package className="w-10 h-10 mx-auto text-stone-300" />
                        <p className="text-xs text-[#79716B]">You have no active or previous orders.</p>
                        <button
                          onClick={() => {
                            setIsAccountOpen(false);
                            onExploreProducts();
                          }}
                          className="text-xs text-[#9E6D47] font-semibold underline underline-offset-4"
                        >
                          Explore mindful candles
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB: MY RITUALS */}
            {activeTab === 'rituals' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Your Saved Mindful Rituals</h4>
                  <p className="text-xs text-[#79716B]">
                    Personalized pauses generated with your candles and saved to your sanctuary.
                  </p>
                </div>

                {savedRituals.length > 0 ? (
                  savedRituals.map((rit) => (
                    <div key={rit.id} className="p-4 bg-white rounded-2xl border border-[#E5DCCE] space-y-2.5 shadow-2xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#9E6D47] font-semibold">
                            {rit.duration} · {rit.context}
                          </span>
                          <h5 className="text-base font-serif font-bold text-[#1F1B18]">{rit.title}</h5>
                        </div>
                        <button
                          onClick={() => handleDeleteRitual(rit.id)}
                          className="p-1 text-stone-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <ol className="space-y-1.5 text-xs text-[#65412E]">
                        {rit.steps.map((st, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-[#9E6D47] font-bold">{i + 1}.</span>
                            <span>{st}</span>
                          </li>
                        ))}
                      </ol>

                      {rit.mantra && (
                        <p className="text-[11px] italic text-[#9E6D47] border-t border-[#E5DCCE] pt-1.5">
                          "{rit.mantra}"
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <Bookmark className="w-10 h-10 mx-auto text-stone-300" />
                    <p className="text-xs text-[#79716B]">You haven't saved any rituals yet.</p>
                    <p className="text-[11px] text-[#79716B]">
                      Open any candle page and click "Create My Ritual" to save your personalized pause.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: REWARDS */}
            {activeTab === 'rewards' && (
              <div className="space-y-6">
                {/* Rewards Balance Banner */}
                <div className="p-5 rounded-3xl bg-gradient-to-br from-[#2A2521] to-[#4A2F22] text-white space-y-3 shadow-md">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest text-[#D18D4D] font-semibold">
                      Calm Points Loyalty
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D18D4D] text-white">
                      Tier: {rewards?.tier || 'Ember'}
                    </span>
                  </div>

                  <div>
                    <span className="text-3xl font-serif font-bold">{rewards?.pointsBalance || 0}</span>
                    <span className="text-xs text-stone-300 ml-2">Available Points</span>
                  </div>

                  <p className="text-[11px] text-stone-300">
                    Earn 10 points for every ₹100 spent · 20 points per completed ritual · 30 points per reflection.
                  </p>
                </div>

                {redeemMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{redeemMsg}</span>
                  </div>
                )}

                {/* Redeem Controls */}
                <div className="p-4 bg-white rounded-2xl border border-[#E5DCCE] space-y-3 shadow-2xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1F1B18] block">
                    Redeem Points for Discount
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleRedeemPoints(100)}
                      disabled={(rewards?.pointsBalance || 0) < 100}
                      className="p-3 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] hover:bg-[#F2ECE1] disabled:opacity-40 text-left transition-colors"
                    >
                      <p className="font-bold text-xs text-[#1F1B18]">₹50 Off Coupon</p>
                      <span className="text-[11px] text-[#9E6D47]">100 Calm Points</span>
                    </button>

                    <button
                      onClick={() => handleRedeemPoints(200)}
                      disabled={(rewards?.pointsBalance || 0) < 200}
                      className="p-3 rounded-xl border border-[#DBC4A9] bg-[#FAF7F2] hover:bg-[#F2ECE1] disabled:opacity-40 text-left transition-colors"
                    >
                      <p className="font-bold text-xs text-[#1F1B18]">₹100 Off Coupon</p>
                      <span className="text-[11px] text-[#9E6D47]">200 Calm Points</span>
                    </button>
                  </div>
                </div>

                {/* Referral Program */}
                <div className="p-4 bg-[#F2ECE1]/70 rounded-2xl border border-[#DBC4A9] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1F1B18]">
                    <Share2 className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Invite Someone to Find Their Flame</span>
                  </div>
                  <p className="text-xs text-[#65412E]">
                    Share your code with friends. They get ₹150 off their first order, and you receive 100 Calm Points!
                  </p>
                  <div className="p-2.5 bg-white rounded-xl border border-[#E5DCCE] flex items-center justify-between font-mono text-xs font-bold text-[#1F1B18]">
                    <span>{rewards?.referralCode || 'CALM-FRIEND'}</span>
                    <span className="text-[10px] text-[#9E6D47] font-sans font-semibold">Copy & Share</span>
                  </div>
                </div>

                {/* Transaction Ledger */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1F1B18]">Activity Ledger</span>
                  <div className="divide-y divide-[#E5DCCE] text-xs">
                    {rewardTx.map((tx, idx) => (
                      <div key={idx} className="py-2.5 flex justify-between items-center text-[#65412E]">
                        <div>
                          <p className="font-semibold text-[#1F1B18]">{tx.description}</p>
                          <p className="text-[10px] text-[#79716B]">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`font-bold ${tx.points > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {tx.points > 0 ? `+${tx.points}` : tx.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PREFERENCES */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Personalized Ritual Profile</h4>
                  <p className="text-xs text-[#79716B]">
                    Tune your preferred moods and botanical scent profiles. These customize your recommendations.
                  </p>
                </div>

                {prefsSavedMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Preferences updated in your account!</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#1F1B18]">Preferred Moods</label>
                  <div className="flex flex-wrap gap-2">
                    {['calm', 'grounded', 'uplifted', 'wind-down', 'connected', 'self-care'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMoodPref(m)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                          moodPrefs.includes(m)
                            ? 'bg-[#2A2521] text-white border-[#2A2521]'
                            : 'bg-white text-[#65412E] border-[#DBC4A9]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#1F1B18]">Preferred Scent Profiles</label>
                  <div className="flex flex-wrap gap-2">
                    {['Herbal', 'Floral', 'Woody', 'Fresh', 'Warm & Sweet'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleScentPref(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          scentPrefs.includes(s)
                            ? 'bg-[#D18D4D] text-white border-[#D18D4D]'
                            : 'bg-white text-[#65412E] border-[#DBC4A9]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#1F1B18]">Fragrance Intensity</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Soft', 'Balanced', 'Rich'].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setIntensityPref(lvl)}
                        className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-colors ${
                          intensityPref === lvl
                            ? 'bg-[#2A2521] text-white border-[#2A2521]'
                            : 'bg-white text-[#65412E] border-[#DBC4A9]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSavePreferences}
                  className="w-full py-2.5 px-4 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Save Preferences
                </button>
              </div>
            )}

            {/* TAB: ADDRESS */}
            {activeTab === 'address' && (
              <form onSubmit={handleSaveAddress} className="space-y-4">
                <div>
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Saved Shipping Address</h4>
                  <p className="text-xs text-[#79716B]">Pre-fills your checkout for quick, tranquil orders.</p>
                </div>

                {addressSavedMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Shipping address saved!</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-[#79716B] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={addressForm.fullName}
                    onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#79716B] mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#79716B] mb-1">Street Address</label>
                  <input
                    type="text"
                    value={addressForm.addressLine1}
                    onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                    required
                    placeholder="House/Apt No., Building, Street"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">City</label>
                    <input
                      type="text"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">State</label>
                    <input
                      type="text"
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#79716B] mb-1">PIN Code</label>
                    <input
                      type="text"
                      value={addressForm.pincode}
                      onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                      required
                      maxLength={6}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#2A2521] hover:bg-[#4A2F22] text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Save Address
                </button>
              </form>
            )}
          </div>

          {/* Footer Sign Out */}
          <div className="p-6 border-t border-[#E5DCCE] bg-[#F2ECE1]/40 flex items-center justify-between">
            <span className="text-xs text-[#79716B]">Session encrypted & persistent</span>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 text-xs text-rose-700 hover:text-rose-900 font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
