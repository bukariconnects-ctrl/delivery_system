import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { SupabaseProvider } from "@/lib/supabase/provider";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Distributed Delivery System",
  description: "نظام توصيل موزّع — Multi-tier Architecture with Centralized Cloud Hub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="ltr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ThemeProvider>
          <SupabaseProvider>
            {children}
            <Toaster position="bottom-center" />
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
