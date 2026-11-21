import { doc, getDocs, setDoc, deleteDoc, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GeneratedRitual } from './aiService';

export interface SavedCustomerRitual extends GeneratedRitual {
  id: string;
  customerId: string;
  productId: string;
  productName: string;
  createdAt: string;
}

export const ritualsService = {
  async saveRitual(
    customerId: string,
    productId: string,
    productName: string,
    ritual: GeneratedRitual
  ): Promise<string> {
    try {
      const ritualId = `rit_${Date.now()}`;
      const docRef = doc(db, 'customers', customerId, 'rituals', ritualId);

      const payload: SavedCustomerRitual = {
        ...ritual,
        id: ritualId,
        customerId,
        productId,
        productName,
        createdAt: new Date().toISOString()
      };

      await setDoc(docRef, payload);
      return ritualId;
    } catch (e) {
      console.warn('Could not save ritual to Firestore:', e);
      return '';
    }
  },

  async getCustomerRituals(customerId: string): Promise<SavedCustomerRitual[]> {
    try {
      const ritualsRef = collection(db, 'customers', customerId, 'rituals');
      const q = query(ritualsRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      const list: SavedCustomerRitual[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SavedCustomerRitual);
      });
      return list;
    } catch (e) {
      return [];
    }
  },

  async deleteRitual(customerId: string, ritualId: string): Promise<void> {
    try {
      const docRef = doc(db, 'customers', customerId, 'rituals', ritualId);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('Could not delete ritual:', e);
    }
  }
};
