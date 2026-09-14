import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "block w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-400 transition-shadow focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-500";

function border(error?: string) {
  return error ? "border-danger-600 focus:border-danger-600" : "border-ink-200 focus:border-brand-400";
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-ink-800">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-ink-400">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  prefix?: string;
}

export function Input({ className, error, prefix, ...rest }: InputProps) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-400">{prefix}</span>
        <input className={cn(control, border(error), "h-11 pl-8", className)} aria-invalid={!!error} {...rest} />
      </div>
    );
  }
  return <input className={cn(control, border(error), "h-11", className)} aria-invalid={!!error} {...rest} />;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function Textarea({ className, error, ...rest }: TextareaProps) {
  return <textarea className={cn(control, border(error), "min-h-24 py-2.5", className)} aria-invalid={!!error} {...rest} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export function Select({ className, error, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select className={cn(control, border(error), "h-11 appearance-none pr-10", className)} aria-invalid={!!error} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
