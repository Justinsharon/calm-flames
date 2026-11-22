/** Checkout contact + delivery address validation (shared by the checkout page and the server). */
export interface CheckoutCustomer {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

/** Indian PIN code: six digits, first digit 1–9. */
export const isValidPincode = (s: string) => /^[1-9][0-9]{5}$/.test(s.trim());
/** Indian mobile: 10 digits starting 6–9, optional +91 / 0 prefix, spaces or dashes allowed. */
export function normalizePhone(s: string): string | null {
  const d = s.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.length <= 254;

export type CustomerErrors = Partial<Record<keyof CheckoutCustomer, string>>;

export function validateCustomer(c: Partial<Record<keyof CheckoutCustomer, unknown>> | null | undefined): CustomerErrors {
  const e: CustomerErrors = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (!c || typeof c !== 'object') return { fullName: 'Enter your details.' };
  if (!isValidEmail(str(c.email))) e.email = 'Enter a valid email address.';
  if (!normalizePhone(str(c.phone))) e.phone = 'Enter a 10-digit Indian mobile number.';
  if (!str(c.fullName) || str(c.fullName).length > 120) e.fullName = 'Enter the full name for delivery.';
  if (!isValidPincode(str(c.pincode))) e.pincode = 'Enter a 6-digit pincode.';
  if (!str(c.addressLine1) || str(c.addressLine1).length > 200) e.addressLine1 = 'Enter the delivery address.';
  if (str(c.addressLine2).length > 200) e.addressLine2 = 'Keep this under 200 characters.';
  if (!str(c.city) || str(c.city).length > 80) e.city = 'Enter the city.';
  if (!str(c.state) || str(c.state).length > 80) e.state = 'Choose the state.';
  return e;
}

/** Trimmed copy with only the known fields (what the server stores). */
export function cleanCustomer(c: any): CheckoutCustomer {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const out: CheckoutCustomer = {
    fullName: s(c.fullName),
    email: s(c.email).toLowerCase(),
    phone: normalizePhone(s(c.phone)) || s(c.phone),
    addressLine1: s(c.addressLine1),
    city: s(c.city),
    state: s(c.state),
    pincode: s(c.pincode)
  };
  if (s(c.addressLine2)) out.addressLine2 = s(c.addressLine2);
  return out;
}
