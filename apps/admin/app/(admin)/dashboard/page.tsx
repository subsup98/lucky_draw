"use client";

import { Card, Typography } from "antd";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <Card title="대시보드">
      <Typography.Paragraph>
        관리자 콘솔 MVP. 현재 사용 가능한 메뉴:
      </Typography.Paragraph>
      <ul>
        <li>
          <Link href="/audit-logs">감사 로그 조회</Link>
        </li>
      </ul>
    </Card>
  );
}
