import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import { Toaster as SonnerToaster } from 'sonner'; // Import Sonner Toaster
import { Toaster } from "@/components/ui/toaster"; // Import ShadCN Toaster if used elsewhere

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Resolution Recorder', // Updated title
  description: 'Record your screen in high resolution.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Added suppressHydrationWarning here
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <SonnerToaster richColors position="top-center" /> {/* Add Sonner Toaster here */}
        <Toaster /> {/* Keep ShadCN Toaster if needed for other components */}
      </body>
    </html>
  );
}
