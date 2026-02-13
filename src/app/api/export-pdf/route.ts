import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "PDF 내보내기는 Phase 4 구현 대상입니다. 현재는 화면 데이터 구조를 고정한 상태이며, react-pdf 또는 playwright 기반 렌더링을 연결하면 즉시 확장 가능합니다."
    },
    { status: 501 }
  );
}
