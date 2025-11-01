'use client';

import React, { createContext, useContext, useState } from 'react';

const TabsContext = createContext<{ value: string; setValue: (value: string) => void } | null>(null);

export function Tabs({ 
  defaultValue, 
  value: controlledValue,
  onValueChange,
  className = '', 
  children, 
  ...props 
}: { 
  defaultValue?: string; 
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  
  const setValue = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-500 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function TabsTrigger({ 
  value, 
  className = '', 
  children, 
  ...props 
}: { 
  value: string; 
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');
  
  const isActive = context.value === value;

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600 hover:text-gray-950'
      } ${className}`}
      onClick={() => context.setValue(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ 
  value, 
  className = '', 
  children, 
  ...props 
}: { 
  value: string; 
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');
  
  if (context.value !== value) return null;

  return (
    <div className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 ${className}`} {...props}>
      {children}
    </div>
  );
}
