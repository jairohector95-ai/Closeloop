import type { QuoteInput } from "./types";
import { isValidISODate, todayISO } from "./utils/date";
import { isValidEmail } from "./utils/text";
import { MAX_FOLLOW_UPS } from "./constants";

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export interface QuoteFormValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quoteNumber: string;
  serviceDescription: string;
  amount: string;
  sentAt: string;
  notes: string;
  schedule: string[];
  tone: QuoteInput["tone"];
}

export function validateQuoteForm(values: QuoteFormValues): { errors: FieldErrors<QuoteFormValues>; input: QuoteInput | null } {
  const errors: FieldErrors<QuoteFormValues> = {};

  if (!values.customerName.trim()) errors.customerName = "Enter the customer's name.";
  if (!values.customerEmail.trim()) errors.customerEmail = "Enter the customer's email so follow-ups have somewhere to go.";
  else if (!isValidEmail(values.customerEmail)) errors.customerEmail = "That email doesn't look right.";
  if (!values.quoteNumber.trim()) errors.quoteNumber = "Add a quote or estimate number.";
  if (!values.serviceDescription.trim()) errors.serviceDescription = "Describe the work, e.g. Interior painting, 3 bedrooms.";

  const amount = Number(values.amount.replace(/[$,\s]/g, ""));
  if (!values.amount.trim()) errors.amount = "Enter the quote amount.";
  else if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter an amount greater than zero.";

  if (!values.sentAt) errors.sentAt = "Pick the date you sent the quote.";
  else if (!isValidISODate(values.sentAt)) errors.sentAt = "Enter a valid date.";
  else if (values.sentAt > todayISO()) errors.sentAt = "The sent date can't be in the future.";

  const schedule = values.schedule.map((s) => Number(s));
  if (schedule.length === 0) errors.schedule = "Add at least one follow-up.";
  else if (schedule.length > MAX_FOLLOW_UPS) errors.schedule = `Keep it to ${MAX_FOLLOW_UPS} follow-ups or fewer.`;
  else if (schedule.some((n) => !Number.isInteger(n) || n < 1 || n > 90)) errors.schedule = "Each follow-up must be between 1 and 90 days after the quote.";
  else if (new Set(schedule).size !== schedule.length) errors.schedule = "Two follow-ups can't be on the same day.";
  else if (schedule.some((n, i) => i > 0 && n <= schedule[i - 1])) errors.schedule = "Follow-ups must be in increasing order.";

  if (Object.keys(errors).length > 0) return { errors, input: null };

  return {
    errors,
    input: {
      customerName: values.customerName,
      customerEmail: values.customerEmail,
      customerPhone: values.customerPhone,
      quoteNumber: values.quoteNumber,
      serviceDescription: values.serviceDescription,
      amount: Math.round(amount * 100) / 100,
      sentAt: values.sentAt,
      notes: values.notes,
      schedule,
      tone: values.tone,
    },
  };
}

export interface OnboardingValues {
  businessName: string;
  ownerName: string;
  email: string;
}

export function validateOnboarding(values: OnboardingValues): FieldErrors<OnboardingValues> {
  const errors: FieldErrors<OnboardingValues> = {};
  if (!values.businessName.trim()) errors.businessName = "What's your business called?";
  if (!values.ownerName.trim()) errors.ownerName = "Enter the name customers should see on emails.";
  if (!values.email.trim()) errors.email = "Enter the email replies should go to.";
  else if (!isValidEmail(values.email)) errors.email = "That email doesn't look right.";
  return errors;
}
