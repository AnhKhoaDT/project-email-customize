import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeProviders from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthInitializer } from "@/components/auth-initializer"; // Vẫn giữ để check user session
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/contexts/toast-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Email Customize",
  description: "Email customization and management application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GoogleOAuthProvider clientId={googleClientId}>
          <ThemeProviders attribute="class" defaultTheme="system" enableSystem>
            <AuthProvider>
              <ToastProvider>
                <AuthInitializer>
                  {/* Chỉ render children thuần túy, layout con sẽ lo phần Sidebar */}
                  {children}
                </AuthInitializer>
              </ToastProvider>
            </AuthProvider>
          </ThemeProviders>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
