import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "SokoHotel | Smarter Restaurant Operations", template: "%s | SokoHotel" },
  description:
    "Manage orders, track sales, control stock and grow your restaurant. Waiters, kitchen, cashiers and managers in one connected app.",
  applicationName: "SokoHotel",
  appleWebApp: { capable: true, title: "SokoHotel", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#C2410C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
