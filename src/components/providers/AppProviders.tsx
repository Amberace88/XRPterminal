"use client";

import { PreferencesProvider } from "./PreferencesProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationsProvider } from "./NotificationsProvider";
import { ToastProvider } from "@/components/ui/Toast";

/** Providers shared by marketing + terminal. Market streaming is only mounted inside the terminal. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ToastProvider>{children}</ToastProvider>
        </NotificationsProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}
