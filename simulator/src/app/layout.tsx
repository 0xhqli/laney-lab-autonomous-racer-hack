import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SyncQueueWorker } from '@/components/sync/SyncQueueWorker';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Deep Racer Simulator",
  description: "Drive. Train. Race the AI.",
};

/**
 * Root layout — wraps every page with global styles and the background sync worker.
 * SyncQueueWorker runs invisibly at the app level so pending run uploads
 * are retried whenever the user is online, regardless of which page they're on.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white overflow-hidden`}>
        {/* Background worker that flushes the run-sync queue on an interval */}
        <SyncQueueWorker />
        {children}
      </body>
    </html>
  );
}
