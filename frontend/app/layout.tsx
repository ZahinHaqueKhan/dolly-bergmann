import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatbotWidget from "@/components/ChatbotWidget";
import { Toaster } from "react-hot-toast";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ModestWear — Elegant Modest Fashion",
  description: "Discover our collection of modest dresses, khimar, and headscarves. Free shipping on orders over $100.",
  keywords: ["modest fashion", "hijab", "khimar", "dresses", "modest clothing"],
  openGraph: {
    title: "ModestWear — Elegant Modest Fashion",
    description: "Discover our collection of modest dresses, khimar, and headscarves.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-800 antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <ChatbotWidget />
        <Toaster position="bottom-right" toastOptions={{ duration: 3000 }} />
      </body>
    </html>
  );
}