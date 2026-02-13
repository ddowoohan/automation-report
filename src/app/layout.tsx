import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DESKER 영업 리포트",
  description: "CSV 업로드 기반 대리점 전략 리포트"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
