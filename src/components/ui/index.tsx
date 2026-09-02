import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

// ==========================
// CARD COMPONENT
// ==========================
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-zinc-950 text-slate-100 shadow-md backdrop-blur-md transition-all duration-300",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-lg font-semibold leading-none tracking-tight text-white", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-slate-400", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0 border-t border-zinc-800/50 mt-4", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";


// ==========================
// BADGE COMPONENT
// ==========================
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'amber' | 'rose' | 'violet' | 'slate' | 'default';
}
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const styles = {
    default: "bg-slate-800 text-slate-200 border-slate-700",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    slate: "bg-slate-500/10 text-slate-400 border-slate-500/20"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}


// ==========================
// BUTTON COMPONENT
// ==========================
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'signal';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyle = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50 active:scale-98";
    
    const variants = {
      default: "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700/50",
      outline: "border border-slate-800 bg-transparent text-slate-300 hover:bg-slate-800/50 hover:text-white",
      ghost: "hover:bg-slate-800/50 text-slate-300 hover:text-white",
      signal: "bg-zinc-300 hover:bg-zinc-250 text-black shadow-md font-bold tracking-wide transition-all border border-zinc-400"
    };

    const sizes = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-11 rounded-md px-8 text-base",
      icon: "h-9 w-9"
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyle, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";


// ==========================
// PROGRESS COMPONENT
// ==========================
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}
export function Progress({ className, value = 0, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max(value, 0), 100);
  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-800", className)}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500 ease-out"
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  );
}


// ==========================
// SKELETON COMPONENT
// ==========================
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-800/80", className)}
      {...props}
    />
  );
}


// ==========================
// TABS COMPONENT
// ==========================
interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}
const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
}
export function Tabs({ defaultValue, value, onValueChange, children, className, ...props }: TabsProps) {
  const [activeTab, setActiveTab] = React.useState(value || defaultValue);

  const handleTabChange = React.useCallback((val: string) => {
    if (value === undefined) {
      setActiveTab(val);
    }
    if (onValueChange) {
      onValueChange(val);
    }
  }, [value, onValueChange]);

  React.useEffect(() => {
    if (value !== undefined) {
      setActiveTab(value);
    }
  }, [value]);

  return (
    <TabsContext.Provider value={{ value: activeTab, onValueChange: handleTabChange }}>
      <div className={cn("space-y-4", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-slate-900/60 p-1 text-slate-400 border border-slate-800/50",
        className
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}
export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used inside Tabs component");

  const isActive = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold tracking-wide ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive 
          ? "bg-slate-800 text-white shadow-sm border border-slate-700/30" 
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/20",
        className
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    />
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}
export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used inside Tabs component");

  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn(
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in",
        className
      )}
      {...props}
    />
  );
}
