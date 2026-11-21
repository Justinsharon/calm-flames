import { doc, getDocs, setDoc, collection, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ProductReview {
  id?: string;
  productId: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  isVerified: boolean;
  isPublished: boolean;
  createdAt: string;
}

export const reviewsService = {
  async getReviewsForProduct(productId: string): Promise<ProductReview[]> {
    try {
      const revRef = collection(db, 'reviews');
      const q = query(revRef, where('productId', '==', productId));
      const snap = await getDocs(q);

      const list: ProductReview[] = [];
      snap.forEach((d) => {
        const item = { id: d.id, ...d.data() } as ProductReview;
        if (item.isPublished !== false) {
          list.push(item);
        }
      });

      if (list.length > 0) {
        return list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      }
    } catch (e) {
      console.warn('Reviews fetch fallback:', e);
    }

    // If no reviews in Firestore, return empty array (do not fabricate customer reviews)
    return [];
  },

  async submitReview(review: Omit<ProductReview, 'id' | 'createdAt' | 'isPublished'>): Promise<string> {
    try {
      const reviewId = `rev_${Date.now()}`;
      const docRef = doc(db, 'reviews', reviewId);

      const payload: ProductReview = {
        ...review,
        id: reviewId,
        isPublished: true, // Default published, can be moderated in admin
        createdAt: new Date().toISOString()
      };

      await setDoc(docRef, payload);
      return reviewId;
    } catch (e) {
      console.warn('Could not submit review to Firestore:', e);
      return '';
    }
  },

  async getAllReviews(): Promise<ProductReview[]> {
    try {
      const revRef = collection(db, 'reviews');
      const snap = await getDocs(revRef);
      const list: ProductReview[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ProductReview);
      });
      return list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    } catch (e) {
      console.warn('Could not fetch all reviews:', e);
      return [];
    }
  },

  async toggleReviewModeration(reviewId: string, isPublished: boolean): Promise<void> {
    try {
      const docRef = doc(db, 'reviews', reviewId);
      await updateDoc(docRef, { isPublished });
    } catch (e) {
      console.warn('Could not update review moderation:', e);
    }
  },

  async deleteReview(reviewId: string): Promise<void> {
    try {
      const { deleteDoc } = await import('firebase/firestore');
      const docRef = doc(db, 'reviews', reviewId);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('Could not delete review:', e);
    }
  }
};
