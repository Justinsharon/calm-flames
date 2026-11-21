import { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface CustomerRewardData {
  customerId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: 'Ember' | 'Glow' | 'Flame';
  referralCode: string;
  updatedAt: string;
}

export interface RewardTransaction {
  id?: string;
  customerId: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export const rewardsService = {
  /**
   * Fetch customer rewards balance and tier
   */
  async getCustomerRewards(customerId: string): Promise<CustomerRewardData> {
    try {
      const rewardRef = doc(db, 'customers', customerId, 'rewards', 'points');
      const snap = await getDoc(rewardRef);

      if (snap.exists()) {
        return snap.data() as CustomerRewardData;
      }

      // Initial points for new customer (50 welcome points)
      const initial: CustomerRewardData = {
        customerId,
        pointsBalance: 50,
        lifetimePoints: 50,
        tier: 'Ember',
        referralCode: `CALM-${customerId.slice(0, 5).toUpperCase()}`,
        updatedAt: new Date().toISOString()
      };

      await setDoc(rewardRef, initial);

      // Log welcome transaction
      await addDoc(collection(db, 'customers', customerId, 'rewardTransactions'), {
        customerId,
        type: 'earn',
        points: 50,
        description: 'Welcome to The Calm Flame Sanctuary',
        createdAt: new Date().toISOString()
      });

      return initial;
    } catch (e) {
      return {
        customerId,
        pointsBalance: 50,
        lifetimePoints: 50,
        tier: 'Ember',
        referralCode: `CALM-${customerId.slice(0, 5).toUpperCase()}`,
        updatedAt: new Date().toISOString()
      };
    }
  },

  /**
   * Fetch reward transaction history
   */
  async getTransactions(customerId: string): Promise<RewardTransaction[]> {
    try {
      const txRef = collection(db, 'customers', customerId, 'rewardTransactions');
      const q = query(txRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      const list: RewardTransaction[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as RewardTransaction);
      });
      return list;
    } catch (e) {
      return [];
    }
  },

  /**
   * Award points for an activity (e.g. order placed, review submitted, ritual practiced)
   */
  async awardPoints(customerId: string, points: number, description: string, referenceId?: string): Promise<void> {
    try {
      const rewardRef = doc(db, 'customers', customerId, 'rewards', 'points');
      const current = await this.getCustomerRewards(customerId);

      const newBalance = current.pointsBalance + points;
      const newLifetime = current.lifetimePoints + points;

      let newTier: 'Ember' | 'Glow' | 'Flame' = 'Ember';
      if (newLifetime >= 1000) newTier = 'Flame';
      else if (newLifetime >= 500) newTier = 'Glow';

      await updateDoc(rewardRef, {
        pointsBalance: newBalance,
        lifetimePoints: newLifetime,
        tier: newTier,
        updatedAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'customers', customerId, 'rewardTransactions'), {
        customerId,
        type: 'earn',
        points,
        description,
        referenceId: referenceId || '',
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not award Calm points:', e);
    }
  },

  /**
   * Redeem points for a discount coupon code
   */
  async redeemPoints(customerId: string, pointsToRedeem: number): Promise<{ success: boolean; couponCode?: string; message: string }> {
    try {
      const current = await this.getCustomerRewards(customerId);
      if (current.pointsBalance < pointsToRedeem) {
        return { success: false, message: 'Insufficient Calm Points balance.' };
      }

      const discountValue = Math.floor(pointsToRedeem * 0.5); // e.g. 100 pts = ₹50
      const generatedCode = `REWARD-${Math.floor(10000 + Math.random() * 90000)}`;

      // Create coupon in Firestore
      await setDoc(doc(db, 'coupons', generatedCode), {
        code: generatedCode,
        type: 'fixed',
        value: discountValue,
        minimumOrderValue: 400,
        usageLimit: 1,
        usedCount: 0,
        isActive: true,
        customerId
      });

      // Deduct points
      const rewardRef = doc(db, 'customers', customerId, 'rewards', 'points');
      await updateDoc(rewardRef, {
        pointsBalance: current.pointsBalance - pointsToRedeem,
        updatedAt: new Date().toISOString()
      });

      // Log transaction
      await addDoc(collection(db, 'customers', customerId, 'rewardTransactions'), {
        customerId,
        type: 'redeem',
        points: -pointsToRedeem,
        description: `Redeemed for ₹${discountValue} Discount (${generatedCode})`,
        referenceId: generatedCode,
        createdAt: new Date().toISOString()
      });

      return {
        success: true,
        couponCode: generatedCode,
        message: `Successfully redeemed ${pointsToRedeem} Calm Points for ₹${discountValue} off!`
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Could not redeem points.' };
    }
  }
};
