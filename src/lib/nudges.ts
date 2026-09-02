export interface NudgeTemplateParams {
  customerName: string;
  amount: number;
  brandName: string;
  paymentLink: string;
}

export type NudgeCause = 'insufficient_balance' | 'reauth' | 'limit_exceeded' | 'confirmation';

export const NUDGE_TEMPLATES: Record<NudgeCause, string> = {
  insufficient_balance: "Namaste {{name}}! Aapka {{brand}} subscription renew nahi ho paya kyunki account mein balance kam tha. Please recharge karke retry karein, bas 30 seconds lagenge: {{link}}",
  reauth: "Hello {{name}}! Aapka {{brand}} mandate expire ho gaya hai. Aapki service uninterrupted rakhne ke liye, please is link par tap karke verify karein: {{link}}",
  limit_exceeded: "Hi {{name}}! Aapka {{brand}} renewal payment ₹{{amount}} bank card limit se exceed ho raha hai. Please transaction limit check karein ya alternative payment method use karein: {{link}}",
  confirmation: "Thank you {{name}}! Aapka ₹{{amount}} payment received ho chuka hai. Aapka {{brand}} subscription actively updated hai."
};

export function generateHinglishNudgeText(cause: NudgeCause, params: NudgeTemplateParams): string {
  const template = NUDGE_TEMPLATES[cause] || NUDGE_TEMPLATES.insufficient_balance;
  
  // Clean first name extraction
  const firstName = params.customerName.split(' ')[0] || 'Customer';
  
  return template
    .replace(/{{name}}/g, firstName)
    .replace(/{{amount}}/g, params.amount.toLocaleString('en-IN'))
    .replace(/{{brand}}/g, params.brandName)
    .replace(/{{link}}/g, params.paymentLink);
}
