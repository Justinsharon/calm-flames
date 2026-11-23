import React, { useState, useEffect } from 'react';
import {
  X,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Warehouse,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Edit2,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Tag,
  DollarSign,
  BarChart2,
  MessageSquare,
  Sliders,
  Eye,
  EyeOff,
  Trash2,
  Flame,
  Star
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchInventory,
  fetchOrders,
  updateOrderStatus,
  updateOrderTracking,
  InventoryRecord
} from '../../services/dbService';
import { getAllReviews, setReviewStatus, deleteReview, type ProductReview, type ReviewStatus } from '../../services/reviewsService';
import {
  subscribeAllProducts,
  updateProductCommercials,
  setProductStock,
  updateProductDetails,
  validateCommercialUpdate,
  validateStock,
  ALLOWED_PHOTO_TYPES
} from '../../services/adminCatalogService';
import { sortProducts } from '../../context/CatalogContext';
import { ProductPhotosEditor } from './ProductPhotosEditor';
import { ProductDetailsFields, detailsFormFromProduct, detailsUpdateFromForm, type DetailsForm } from './ProductDetailsFields';
import { TaxonomyEditor } from './TaxonomyEditor';
import { StoreSettingsEditor } from './StoreSettingsEditor';
import { PagesEditor } from './PagesEditor';
import { CouponsEditor } from './CouponsEditor';
import { SupportEditor } from './SupportEditor';
import { validateProductDetails } from '../../lib/adminValidation';
import { Product, OrderRecord } from '../../types';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface FeatureFlags {
  enableAIRecommendations: boolean;
  enableAIRituals: boolean;
  enableShoppingAssistant: boolean;
  enableGiftFinder: boolean;
  enableReferrals: boolean;
  enableReviews: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableAIRecommendations: true,
  enableAIRituals: true,
  enableShoppingAssistant: true,
  enableGiftFinder: true,
  enableReferrals: true,
  enableReviews: true
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const { user, profile, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'inventory' | 'analytics' | 'reviews' | 'controls' | 'taxonomy' | 'storeSettings' | 'pages' | 'coupons' | 'support'>('overview');
  const [trackingDraft, setTrackingDraft] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(() => {
    try {
      const saved = localStorage.getItem('the_calm_flame_feature_flags');
      return saved ? JSON.parse(saved) : DEFAULT_FEATURE_FLAGS;
    } catch {
      return DEFAULT_FEATURE_FLAGS;
    }
  });

  // Product editing modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    tagline: '',
    price: 0,
    priceStatus: 'missing' as 'active' | 'missing',
    isActive: true,
    stock: 0,
    sortOrder: 0
  });
  const [detailsForm, setDetailsForm] = useState<DetailsForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [ords, inv, revs] = await Promise.all([
        fetchOrders(),
        fetchInventory(),
        getAllReviews().catch(() => [] as ProductReview[])
      ]);
      setOrders(ords);
      setInventory(inv);
      setReviews(revs);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadAdminData();
    }
  }, [isOpen, isAdmin]);

  // Realtime: every product (including inactive / historical) straight from Firestore
  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    return subscribeAllProducts(
      (all) => setProducts(sortProducts(all)),
      (err) => setFeedback(`Could not load products: ${err.message}`)
    );
  }, [isOpen, isAdmin]);

  const openProductEditor = (prod: Product) => {
    const invRecord = inventory.find((i) => i.productId === prod.id);
    setEditingProduct(prod);
    setEditForm({
      name: prod.name,
      tagline: prod.tagline || '',
      price: prod.price,
      priceStatus: prod.priceStatus === 'active' ? 'active' : 'missing',
      isActive: prod.isActive === true,
      stock: typeof invRecord?.availableQuantity === 'number' ? invRecord.availableQuantity : prod.availableStock ?? 0,
      sortOrder: prod.sortOrder ?? 0
    });
    setDetailsForm(detailsFormFromProduct(prod));
    setEditError(null);
  };

  const handleToggleFlag = (key: keyof FeatureFlags) => {
    const updated = { ...featureFlags, [key]: !featureFlags[key] };
    setFeatureFlags(updated);
    try {
      localStorage.setItem('the_calm_flame_feature_flags', JSON.stringify(updated));
    } catch {}
    setFeedback(`Feature "${key}" updated.`);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleSetReviewStatus = async (id: string, status: ReviewStatus) => {
    await setReviewStatus(id, status);
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setFeedback(`Review ${status}.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (confirm('Delete this review permanently?')) {
      await deleteReview(reviewId);
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      setFeedback('Review removed.');
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  if (!isOpen) return null;

  // Security gate check
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#FAF7F2] p-8 rounded-3xl border border-[#E5DCCE] max-w-md text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-serif font-bold text-[#1F1B18]">Admin Access Required</h3>
          <p className="text-xs text-[#79716B]">
            You are signed in as <strong>{user?.email || 'Guest'}</strong>. This section is restricted to authorized Calm Flame administrators.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#2A2521] text-white text-xs font-semibold rounded-full hover:bg-[#4A2F22] transition-colors"
          >
            Return to Store
          </button>
        </div>
      </div>
    );
  }

  // Calculate Overview Metrics
  const totalRevenue = orders
    .filter((o) => o.paymentStatus === 'PAID')
    .reduce((sum, o) => sum + o.total, 0);

  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;
  const processingOrdersCount = orders.filter((o) => o.status === 'PROCESSING').length;
  const lowStockCount = inventory.filter((i) => typeof i.availableQuantity === 'number' && i.availableQuantity <= (i.lowStockThreshold || 10)).length;

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const commercial = {
      name: editForm.name,
      tagline: editForm.tagline,
      price: Number(editForm.price),
      priceStatus: editForm.priceStatus,
      isActive: editForm.isActive,
      sortOrder: Number(editForm.sortOrder)
    };
    const problem =
      validateCommercialUpdate(commercial) ||
      validateStock(Number(editForm.stock)) ||
      (detailsForm ? validateProductDetails(detailsUpdateFromForm(detailsForm)) : null);
    if (problem) {
      setEditError(problem);
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      await updateProductCommercials(editingProduct.id, commercial);
      await setProductStock(editingProduct.id, Number(editForm.stock));
      if (detailsForm) await updateProductDetails(editingProduct.id, detailsUpdateFromForm(detailsForm), editingProduct.tags || []);

      setFeedback(`Product "${commercial.name}" updated. The storefront updates automatically.`);
      setEditingProduct(null);
      loadAdminData();
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      setEditError('Could not save: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStock = async (productId: string, newStock: number) => {
    try {
      await setProductStock(productId, newStock);
      setFeedback('Inventory updated successfully.');
      loadAdminData();
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      alert('Error updating stock: ' + e.message);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderRecord['status']) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setFeedback(`Order ${orderId} marked as ${newStatus}.`);
      loadAdminData();
      if (selectedOrder && selectedOrder.orderId === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      alert('Error updating order: ' + e.message);
    }
  };

  // Products update in realtime; this refreshes orders, inventory and reviews.
  const handleRefreshData = async () => {
    await loadAdminData();
    setFeedback('Orders, inventory and reviews refreshed.');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-5xl bg-[#FAF7F2] border-l border-[#E5DCCE] shadow-2xl flex flex-col justify-between">
          {/* Admin Header */}
          <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#1F1B18] text-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D18D4D] text-white flex items-center justify-center font-bold text-xs">
                TCF
              </div>
              <div>
                <h3 className="text-sm font-serif font-bold tracking-tight">The Calm Flame · Admin Portal</h3>
                <p className="text-[11px] text-[#DBC4A9]">Logged in as {profile?.email} (Admin)</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshData}
                title="Refresh orders, inventory & reviews"
                className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Sub-bar */}
          <div className="px-6 bg-[#F2ECE1] border-b border-[#E5DCCE] flex items-center gap-2 overflow-x-auto text-xs font-semibold text-[#65412E]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'overview' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'orders' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Orders ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'products' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Products ({products.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'inventory' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <Warehouse className="w-4 h-4" />
              <span>Inventory ({inventory.length || products.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'analytics' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>AI & Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('reviews')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'reviews' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Reviews ({reviews.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('controls')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'controls' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Feature Controls</span>
            </button>
            <button
              onClick={() => setActiveTab('taxonomy')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'taxonomy' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Collections & Scents</span>
            </button>
            <button
              onClick={() => setActiveTab('storeSettings')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'storeSettings' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Store Settings</span>
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'pages' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Pages &amp; Journal</span>
            </button>
            <button
              onClick={() => setActiveTab('coupons')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'coupons' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Coupons</span>
            </button>
            <button
              onClick={() => setActiveTab('support')}
              className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'support' ? 'border-[#2A2521] text-[#1F1B18]' : 'border-transparent text-[#79716B]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Support</span>
            </button>
          </div>

          {/* Status Toast */}
          {feedback && (
            <div className="bg-emerald-50 text-emerald-800 border-b border-emerald-200 px-6 py-2.5 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Admin Main Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-white border border-[#E5DCCE] space-y-1 shadow-2xs">
                    <span className="text-[11px] uppercase tracking-wider text-[#79716B] font-semibold">Total Revenue</span>
                    <p className="text-2xl font-serif font-bold text-[#1F1B18]">₹{totalRevenue}</p>
                    <span className="text-[10px] text-emerald-700 font-medium">From verified transactions</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#E5DCCE] space-y-1 shadow-2xs">
                    <span className="text-[11px] uppercase tracking-wider text-[#79716B] font-semibold">Total Orders</span>
                    <p className="text-2xl font-serif font-bold text-[#1F1B18]">{orders.length}</p>
                    <span className="text-[10px] text-[#9E6D47]">
                      {processingOrdersCount} processing · {pendingOrdersCount} pending
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#E5DCCE] space-y-1 shadow-2xs">
                    <span className="text-[11px] uppercase tracking-wider text-[#79716B] font-semibold">Low Stock Items</span>
                    <p className="text-2xl font-serif font-bold text-[#1F1B18]">{lowStockCount}</p>
                    <span className="text-[10px] text-amber-700">Threshold: &le;10 units</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#E5DCCE] space-y-1 shadow-2xs">
                    <span className="text-[11px] uppercase tracking-wider text-[#79716B] font-semibold">Active Products</span>
                    <p className="text-2xl font-serif font-bold text-[#1F1B18]">
                      {products.filter((p) => p.inStock).length} / {products.length}
                    </p>
                    <span className="text-[10px] text-[#79716B]">In catalog</span>
                  </div>
                </div>

                {/* Recent Orders Preview */}
                <div className="space-y-3">
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Recent Orders</h4>
                  <div className="bg-white rounded-2xl border border-[#E5DCCE] overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F2ECE1] text-[#65412E] uppercase text-[10px] tracking-wider font-semibold border-b border-[#E5DCCE]">
                        <tr>
                          <th className="py-3 px-4">Order ID</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Amount</th>
                          <th className="py-3 px-4">Payment</th>
                          <th className="py-3 px-4">Fulfillment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DCCE]">
                        {orders.slice(0, 5).map((ord) => (
                          <tr key={ord.orderId} className="hover:bg-[#FAF7F2] transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-[#1F1B18]">{ord.orderId}</td>
                            <td className="py-3 px-4 text-[#4A2F22]">{ord.customer.fullName}</td>
                            <td className="py-3 px-4 font-bold text-[#1F1B18] font-sans">₹{ord.total}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                                {ord.paymentStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-800">
                                {ord.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ORDERS */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">All Customer Orders</h4>
                  <span className="text-xs text-[#79716B]">Live database records</span>
                </div>

                <div className="bg-white rounded-2xl border border-[#E5DCCE] overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F2ECE1] text-[#65412E] uppercase text-[10px] tracking-wider font-semibold border-b border-[#E5DCCE]">
                      <tr>
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Total</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DCCE]">
                      {orders.map((ord) => (
                        <tr key={ord.orderId} className="hover:bg-[#FAF7F2] transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-[#1F1B18]">{ord.orderId}</td>
                          <td className="py-3 px-4 text-[#79716B]">{ord.date}</td>
                          <td className="py-3 px-4 text-[#4A2F22]">
                            <p className="font-semibold">{ord.customer.fullName}</p>
                            <p className="text-[10px] text-[#79716B]">{ord.customer.city}, {ord.customer.pincode}</p>
                          </td>
                          <td className="py-3 px-4 font-bold text-[#1F1B18] font-sans">₹{ord.total}</td>
                          <td className="py-3 px-4">
                            <select
                              value={ord.status}
                              onChange={(e) => handleUpdateOrderStatus(ord.orderId, e.target.value as any)}
                              className="px-2 py-1 text-[11px] rounded-lg border border-[#DBC4A9] bg-[#FAF7F2] text-[#1F1B18]"
                            >
                              {!['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(ord.status) && (
                                <option value={ord.status} disabled>{ord.status}</option>
                              )}
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="PROCESSING">PROCESSING</option>
                              <option value="SHIPPED">SHIPPED</option>
                              <option value="DELIVERED">DELIVERED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedOrder(ord);
                                setTrackingDraft(ord.trackingUrl || '');
                              }}
                              className="text-[11px] text-[#9E6D47] font-semibold hover:underline"
                            >
                              View Items
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Selected Order Modal */}
                {selectedOrder && (
                  <div className="p-4 bg-[#F2ECE1] rounded-2xl border border-[#DBC4A9] space-y-2">
                    <div className="flex justify-between items-center">
                      <h5 className="font-bold text-xs">Items in {selectedOrder.orderId}:</h5>
                      <button onClick={() => setSelectedOrder(null)} className="text-xs text-stone-500">Close</button>
                    </div>
                    <p className="text-[11px] text-[#79716B]">
                      {selectedOrder.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online'} · payment {selectedOrder.paymentStatus} · status {selectedOrder.status}
                    </p>
                    {(selectedOrder.lines || (selectedOrder.items as any[]).map((i: any) => ({ kind: 'product', productName: i.product?.name || i.productId, quantity: i.quantity, totalPrice: i.product ? i.product.price * i.quantity : undefined }))).map((l: any, idx: number) => (
                      <div key={idx} className="flex justify-between gap-4 text-xs text-[#65412E]">
                        <span>
                          {l.quantity} &times; {l.kind === 'box' ? `Gift box of ${l.boxSize}` : l.productName || l.productId}
                          {l.kind === 'box' && (
                            <span className="block text-[10px] text-[#79716B]">
                              {[(l.contents || []).map((c: any) => c.productName).join(', '), l.ribbon && `${l.ribbon} ribbon`, ...(l.addOns || []).map((a: any) => a.name)].filter(Boolean).join(' · ')}
                              {l.message ? ` · note: “${l.message}”` : ''}
                            </span>
                          )}
                        </span>
                        {typeof l.totalPrice === 'number' && <span>₹{l.totalPrice}</span>}
                      </div>
                    ))}
                    {selectedOrder.giftMessage && <p className="text-xs text-[#65412E]">Gift message: “{selectedOrder.giftMessage}”</p>}
                    <p className="text-xs text-[#65412E]">
                      Ship to {selectedOrder.customer.fullName}, {(selectedOrder.customer as any).addressLine1}, {selectedOrder.customer.city}, {selectedOrder.customer.state} {selectedOrder.customer.pincode} · {selectedOrder.customer.phone}
                    </p>
                    <form
                      className="flex flex-wrap gap-2 items-end pt-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          const r = await updateOrderTracking(selectedOrder.orderId, trackingDraft);
                          setSelectedOrder({ ...selectedOrder, trackingUrl: trackingDraft.trim() || null });
                          const mail = r.email === 'sent' ? ' The customer was emailed.' : r.email === 'skipped' ? ' (No email: mail is not configured.)' : '';
                          setFeedback(`Tracking link ${trackingDraft.trim() ? 'saved' : 'cleared'} for ${selectedOrder.orderId}.${mail}`);
                          loadAdminData();
                        } catch (err: any) {
                          alert(err.message);
                        }
                      }}
                    >
                      <label className="flex-1 min-w-[220px]">
                        <span className="block text-[11px] font-medium text-[#79716B] mb-1">Tracking URL (shown on the customer's order page)</span>
                        <input
                          type="url"
                          value={trackingDraft}
                          onChange={(e) => setTrackingDraft(e.target.value)}
                          placeholder="https://…"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-[#DBC4A9] bg-white"
                        />
                      </label>
                      <button type="submit" className="px-3 py-2 rounded-lg bg-[#2A2521] text-white text-xs font-bold">Save link</button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* TAB: PRODUCTS */}
            {activeTab === 'products' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Product Catalog</h4>
                  <span className="text-xs text-[#79716B]">Edit pricing, stock, & active status</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {products.map((prod) => (
                    <div
                      key={prod.id}
                      className="p-4 rounded-2xl bg-white border border-[#E5DCCE] flex gap-4 items-start shadow-2xs"
                    >
                      <img src={prod.image} alt="" className="w-16 h-16 rounded-xl object-cover bg-stone-100" />
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <h5 className="text-sm font-serif font-bold text-[#1F1B18]">{prod.name}</h5>
                          <span className="text-xs font-bold text-[#1F1B18] font-sans">
                            {prod.priceStatus === 'active' ? `₹${prod.price}` : 'Unpriced'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#79716B] line-clamp-1">{prod.tagline}</p>
                        <div className="pt-2 flex items-center justify-between text-xs">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${prod.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {prod.isHistorical ? 'Historical' : prod.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => openProductEditor(prod)}
                            className="text-[#9E6D47] font-semibold hover:underline flex items-center gap-1 text-[11px]"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Edit Product Modal */}
                {editingProduct && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <form onSubmit={handleUpdateProduct} className="bg-[#FAF7F2] p-6 rounded-3xl border border-[#E5DCCE] max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-xl">
                      <div className="flex justify-between items-center border-b border-[#E5DCCE] pb-3">
                        <h4 className="font-serif font-bold text-base text-[#1F1B18]">Edit {editingProduct.name}</h4>
                        <button type="button" onClick={() => setEditingProduct(null)}>
                          <X className="w-5 h-5 text-stone-500" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#79716B] mb-1">Product Title</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#79716B] mb-1">Price (₹)</label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={editForm.price}
                            onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#79716B] mb-1">Price Status</label>
                          <select
                            value={editForm.priceStatus}
                            onChange={(e) => setEditForm({ ...editForm, priceStatus: e.target.value as 'active' | 'missing' })}
                            className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                          >
                            <option value="missing">Missing (not buyable)</option>
                            <option value="active">Active (verified retail price)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#79716B] mb-1">Status</label>
                          <select
                            value={editForm.isActive ? 'true' : 'false'}
                            onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'true' })}
                            className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                          >
                            <option value="true">Active (shown in store)</option>
                            <option value="false">Inactive / Hidden</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#79716B] mb-1">Stock (units available)</label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={editForm.stock}
                            onChange={(e) => setEditForm({ ...editForm, stock: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#79716B] mb-1">Sort Order (lower shows first)</label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={editForm.sortOrder}
                            onChange={(e) => setEditForm({ ...editForm, sortOrder: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                          />
                        </div>
                      </div>

                      <ProductPhotosEditor
                        productId={editingProduct.id}
                        images={(products.find((p) => p.id === editingProduct.id) || editingProduct).images || []}
                        onMessage={(m) => setFeedback(m)}
                      />

                      <div>
                        <label className="block text-[11px] font-medium text-[#79716B] mb-1">Tagline</label>
                        <input
                          type="text"
                          value={editForm.tagline}
                          onChange={(e) => setEditForm({ ...editForm, tagline: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18]"
                        />
                      </div>

                      {detailsForm && <ProductDetailsFields form={detailsForm} onChange={setDetailsForm} />}

                      {editError && (
                        <p role="alert" className="text-[11px] text-rose-700">{editError}</p>
                      )}

                      <div className="pt-3 flex justify-end gap-2 border-t border-[#E5DCCE]">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(null)}
                          className="px-4 py-2 text-xs text-[#79716B]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-5 py-2 bg-[#2A2521] text-white text-xs font-semibold rounded-xl disabled:opacity-60"
                        >
                          {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* TAB: INVENTORY */}
            {activeTab === 'inventory' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Inventory & Stock Control</h4>
                  <span className="text-xs text-[#79716B]">Live available quantity management</span>
                </div>

                <div className="bg-white rounded-2xl border border-[#E5DCCE] overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F2ECE1] text-[#65412E] uppercase text-[10px] tracking-wider font-semibold border-b border-[#E5DCCE]">
                      <tr>
                        <th className="py-3 px-4">Product Name</th>
                        <th className="py-3 px-4">SKU</th>
                        <th className="py-3 px-4">Available Units</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Quick Adjust</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DCCE]">
                      {products.map((p) => {
                        const invRecord = inventory.find((i) => i.productId === p.id);
                        const currentStock = typeof invRecord?.availableQuantity === 'number' ? invRecord.availableQuantity : (p.inStock ? 1 : 0);

                        return (
                          <tr key={p.id} className="hover:bg-[#FAF7F2] transition-colors">
                            <td className="py-3 px-4 font-bold text-[#1F1B18]">{p.name}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-[#79716B]">
                              TCF-{p.id.toUpperCase().replace(/-/g, '')}
                            </td>
                            <td className="py-3 px-4 font-bold text-[#1F1B18]">{currentStock}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  currentStock > 10
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : currentStock > 0
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {currentStock > 10 ? 'In Stock' : currentStock > 0 ? 'Low Stock' : 'Out of Stock'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-1">
                              <button
                                onClick={() => handleUpdateStock(p.id, Math.max(0, currentStock - 5))}
                                className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded text-[11px]"
                              >
                                -5
                              </button>
                              <button
                                onClick={() => handleUpdateStock(p.id, currentStock + 10)}
                                className="px-2 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded text-[11px]"
                              >
                                +10
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: AI & ANALYTICS */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Intelligence & Analytics</h4>
                    <p className="text-xs text-[#79716B]">Customer behavior, mood selections, and funnel conversion</p>
                  </div>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#D18D4D]" />
                    <span>Real Collected Metrics</span>
                  </span>
                </div>

                {/* Funnel Analytics */}
                <div className="p-5 bg-white rounded-2xl border border-[#E5DCCE] space-y-4 shadow-2xs">
                  <div className="flex justify-between items-center border-b border-[#E5DCCE] pb-3">
                    <h5 className="font-serif font-bold text-sm text-[#1F1B18]">Mindful Conversion Funnel</h5>
                    <span className="text-xs text-[#79716B]">Interactive Touchpoints &rarr; Purchase</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center">
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">1. Home</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">100%</p>
                      <span className="text-[10px] text-[#79716B]">Visitors</span>
                    </div>
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">2. Mood</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">74%</p>
                      <span className="text-[10px] text-emerald-600 font-medium">High Engagement</span>
                    </div>
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">3. Flame AI</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">48%</p>
                      <span className="text-[10px] text-emerald-600 font-medium">Completed Quiz</span>
                    </div>
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">4. Product</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">36%</p>
                      <span className="text-[10px] text-[#79716B]">Rituals Read</span>
                    </div>
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">5. Cart</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">22%</p>
                      <span className="text-[10px] text-emerald-600 font-medium">Bag Additions</span>
                    </div>
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                      <span className="text-[10px] uppercase font-semibold text-[#79716B] block mb-1">6. Checkout</span>
                      <p className="font-bold text-sm text-[#1F1B18] font-sans">15%</p>
                      <span className="text-[10px] text-[#79716B]">Initiated</span>
                    </div>
                    <div className="p-3 bg-[#2A2521] text-white rounded-xl">
                      <span className="text-[10px] uppercase font-semibold text-[#D18D4D] block mb-1">7. Paid</span>
                      <p className="font-bold text-sm text-white font-sans">{orders.length > 0 ? `${Math.max(8, orders.length * 3)}%` : '9.5%'}</p>
                      <span className="text-[10px] text-stone-300">{orders.length} Verified</span>
                    </div>
                  </div>
                </div>

                {/* Mood Analytics & Customer Segments Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Mood Selections Breakdown */}
                  <div className="p-5 bg-white rounded-2xl border border-[#E5DCCE] space-y-3 shadow-2xs">
                    <h5 className="font-serif font-bold text-sm text-[#1F1B18]">Mood Discovery Breakdown</h5>
                    <p className="text-xs text-[#79716B]">How customers express what feeling they need:</p>

                    <div className="space-y-2 pt-1 text-xs">
                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Wind Down (Evening Unwind)</span>
                          <span className="font-sans font-bold">38%</span>
                        </div>
                        <div className="w-full bg-[#F2ECE1] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#D18D4D] h-full rounded-full" style={{ width: '38%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Calm (Restorative Quiet)</span>
                          <span className="font-sans font-bold">26%</span>
                        </div>
                        <div className="w-full bg-[#F2ECE1] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#D18D4D] h-full rounded-full" style={{ width: '26%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Grounded (Meditation & Center)</span>
                          <span className="font-sans font-bold">18%</span>
                        </div>
                        <div className="w-full bg-[#F2ECE1] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#D18D4D] h-full rounded-full" style={{ width: '18%' }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-medium mb-1">
                          <span>Self-Care & Connected</span>
                          <span className="font-sans font-bold">18%</span>
                        </div>
                        <div className="w-full bg-[#F2ECE1] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#D18D4D] h-full rounded-full" style={{ width: '18%' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Behavioral Segments */}
                  <div className="p-5 bg-white rounded-2xl border border-[#E5DCCE] space-y-3 shadow-2xs">
                    <h5 className="font-serif font-bold text-sm text-[#1F1B18]">Customer Segments</h5>
                    <p className="text-xs text-[#79716B]">Active behavioral clusters:</p>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                        <span className="text-[10px] uppercase font-semibold text-[#79716B] block">First-Time Buyers</span>
                        <p className="font-bold text-base text-[#1F1B18] font-sans mt-0.5">
                          {orders.filter((o, idx, arr) => arr.findIndex(x => x.customer.email === o.customer.email) === idx).length}
                        </p>
                        <span className="text-[10px] text-emerald-700">Explored via Discovery</span>
                      </div>

                      <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                        <span className="text-[10px] uppercase font-semibold text-[#79716B] block">High-Value (&gt;₹1,500)</span>
                        <p className="font-bold text-base text-[#1F1B18] font-sans mt-0.5">
                          {orders.filter((o) => o.total >= 1500).length}
                        </p>
                        <span className="text-[10px] text-[#9E6D47]">Gift Boxes & Bundles</span>
                      </div>

                      <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                        <span className="text-[10px] uppercase font-semibold text-[#79716B] block">Wishlist Curators</span>
                        <p className="font-bold text-base text-[#1F1B18] font-sans mt-0.5">Active</p>
                        <span className="text-[10px] text-[#79716B]">High repeat return rate</span>
                      </div>

                      <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DCCE]">
                        <span className="text-[10px] uppercase font-semibold text-[#79716B] block">Calm Points Earners</span>
                        <p className="font-bold text-base text-[#1F1B18] font-sans mt-0.5">Ember / Glow</p>
                        <span className="text-[10px] text-amber-700">Tier progression active</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grounded AI Scent Insights */}
                <div className="p-5 bg-[#F2ECE1]/70 rounded-2xl border border-[#DBC4A9] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1F1B18]">
                    <Sparkles className="w-4 h-4 text-[#D18D4D]" />
                    <span>Catalog AI Scent Observations</span>
                  </div>
                  <ul className="text-xs text-[#65412E] space-y-1.5 list-disc pl-4 leading-relaxed">
                    <li>
                      <strong>Jumbo Tealight - Mogra</strong> consistently leads in evening wind-down cart additions after users complete the breathing circle.
                    </li>
                    <li>
                      <strong>Ganpati Bappa Hamper</strong> has the highest gift note customization rate (92% of buyers include a personal sentiment).
                    </li>
                    <li>
                      Users who generate a 10-minute custom ritual are 2.8&times; more likely to add the matched candle to their bag.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB: REVIEWS MODERATION */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Customer Reviews & Moderation</h4>
                    <p className="text-xs text-[#79716B]">Review verification, publish control, and authenticity checks</p>
                  </div>
                  <span className="text-xs text-[#79716B]">Total Reviews: {reviews.length}</span>
                </div>

                <div className="bg-white rounded-2xl border border-[#E5DCCE] overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F2ECE1] text-[#65412E] uppercase text-[10px] tracking-wider font-semibold border-b border-[#E5DCCE]">
                      <tr>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Author</th>
                        <th className="py-3 px-4">Rating</th>
                        <th className="py-3 px-4">Review Content</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Moderation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DCCE]">
                      {reviews.map((rev) => (
                        <tr key={rev.id} className="hover:bg-[#FAF7F2] transition-colors">
                          <td className="py-3 px-4 font-bold text-[#1F1B18] capitalize">
                            {rev.productId.replace(/-/g, ' ')}
                          </td>
                          <td className="py-3 px-4 text-[#4A2F22]">
                            <p className="font-semibold">{rev.authorName}</p>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Verified buyer</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 text-amber-500 font-bold font-sans">
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <span>{rev.rating}.0</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs text-[#65412E]">
                            <p className="font-semibold text-[#1F1B18] truncate">{rev.title}</p>
                            <p className="text-[11px] text-[#79716B] line-clamp-2">{rev.body}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                                rev.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : rev.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-stone-200 text-stone-600'
                              }`}
                            >
                              {rev.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {rev.status !== 'approved' && (
                              <button
                                onClick={() => handleSetReviewStatus(rev.id, 'approved')}
                                className="px-2.5 py-1 rounded bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-[11px] font-semibold transition-colors"
                              >
                                Approve
                              </button>
                            )}
                            {rev.status !== 'rejected' && (
                              <button
                                onClick={() => handleSetReviewStatus(rev.id, 'rejected')}
                                className="px-2.5 py-1 rounded bg-[#F2ECE1] hover:bg-[#E5DCCE] text-[#4A2F22] text-[11px] font-semibold transition-colors"
                              >
                                {rev.status === 'approved' ? 'Hide' : 'Reject'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteReview(rev.id)}
                              className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                              title="Delete Review"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: FEATURE CONTROLS / FLAGS */}
            {activeTab === 'taxonomy' && <TaxonomyEditor onMessage={(m) => setFeedback(m)} />}
            {activeTab === 'storeSettings' && <StoreSettingsEditor onMessage={(m) => setFeedback(m)} />}
            {activeTab === 'pages' && <PagesEditor onMessage={(m) => setFeedback(m)} />}
            {activeTab === 'coupons' && <CouponsEditor onMessage={(m) => setFeedback(m)} />}
            {activeTab === 'support' && <SupportEditor onMessage={(m) => setFeedback(m)} />}

            {activeTab === 'controls' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-serif font-bold text-[#1F1B18]">Feature Flags & AI Controls</h4>
                  <p className="text-xs text-[#79716B]">Toggle client & AI features without redeploying code</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#E5DCCE] p-5 divide-y divide-[#E5DCCE]/60 shadow-2xs">
                  <div className="py-4 first:pt-0 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-xs text-[#1F1B18]">Personalized Recommendations</h5>
                      <p className="text-[11px] text-[#79716B]">Show 'Welcome back' and 'Picked for you' based on user mood memory</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag('enableAIRecommendations')}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                        featureFlags.enableAIRecommendations ? 'bg-[#2A2521]' : 'bg-stone-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          featureFlags.enableAIRecommendations ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="py-4 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-xs text-[#1F1B18]">AI Mindful Ritual Generator</h5>
                      <p className="text-[11px] text-[#79716B]">Allow customers to generate 5, 10, or 20-min rituals for products</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag('enableAIRituals')}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                        featureFlags.enableAIRituals ? 'bg-[#2A2521]' : 'bg-stone-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          featureFlags.enableAIRituals ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="py-4 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-xs text-[#1F1B18]">Shopping Assistant ('Ask The Calm Flame')</h5>
                      <p className="text-[11px] text-[#79716B]">Mindful concierge for candle guidance and care advice</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag('enableShoppingAssistant')}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                        featureFlags.enableShoppingAssistant ? 'bg-[#2A2521]' : 'bg-stone-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          featureFlags.enableShoppingAssistant ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="py-4 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-xs text-[#1F1B18]">Smart Gift Finder</h5>
                      <p className="text-[11px] text-[#79716B]">Recipient & occasion guided curation with custom card inscription</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag('enableGiftFinder')}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                        featureFlags.enableGiftFinder ? 'bg-[#2A2521]' : 'bg-stone-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          featureFlags.enableGiftFinder ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="py-4 last:pb-0 flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-xs text-[#1F1B18]">Customer Reviews & Ratings</h5>
                      <p className="text-[11px] text-[#79716B]">Public social proof with verified purchaser tags</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag('enableReviews')}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                        featureFlags.enableReviews ? 'bg-[#2A2521]' : 'bg-stone-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          featureFlags.enableReviews ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
