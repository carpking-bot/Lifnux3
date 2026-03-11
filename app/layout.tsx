import type { Metadata } from "next";
import "./globals.css";
import { MusicPlayerProvider } from "./(shared)/components/MusicPlayerProvider";
import { GlobalMusicPlayerOverlay } from "./(shared)/components/GlobalMusicPlayerOverlay";
import { TopMenu } from "./(shared)/components/TopMenu";
import { LifnuxStartupDataSync } from "./(shared)/components/LifnuxStartupDataSync";

export const metadata: Metadata = {
  title: "Lifnux",
  description: "Life + Linux personal OS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <MusicPlayerProvider>
          <LifnuxStartupDataSync />
          {children}
          <GlobalMusicPlayerOverlay />
          <TopMenu />
        </MusicPlayerProvider>
      </body>
    </html>
  );
}
