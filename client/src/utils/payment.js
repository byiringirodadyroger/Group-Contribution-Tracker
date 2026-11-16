export const PAYMENT_METHODS = [
  { value: "mtn_mobile_money", label: "MTN Mobile Money" },
  { value: "airtel_mobile_money", label: "Airtel Money" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" }
];

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || value || "—";
}
