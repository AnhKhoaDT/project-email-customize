"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { X } from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: Toast["type"], duration?: number) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info", duration: number = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, message, type, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const getToastStyles = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "bg-green-500 dark:bg-green-600 text-white";
      case "error":
        return "bg-red-500 dark:bg-red-600 text-white";
      case "warning":
        return "bg-yellow-500 dark:bg-yellow-600 text-white";
      case "info":
      default:
        return "bg-blue-500 dark:bg-blue-600 text-white";
    }
  };

  const getToastIcon = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
      default:
        return "ℹ";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      
      {/* Toast Container (higher z-index so toasts appear above modals) */}
      <div className="fixed top-4 right-4 z-[110] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${getToastStyles(toast.type)} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-[400px] pointer-events-auto animate-in slide-in-from-right duration-300`}
          >
            <span className="text-lg font-bold">{getToastIcon(toast.type)}</span>
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => hideToast(toast.id)}
              className="hover:bg-white/20 rounded p-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
