import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "매일유업 VOC AI",
  description: "네이버와 유튜브 공개 VOC를 자동 수집·분석하는 매일유업 VOC 에이전트"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
