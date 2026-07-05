import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "개인정보처리방침 - 럭키드로우 관리자",
};

function loadPolicy(): string {
  const p = path.join(process.cwd(), "..", "..", "policy", "privacy_policy.md");
  return fs.readFileSync(p, "utf8");
}

export default function PrivacyPage() {
  const md = loadPolicy();
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <Link href="/login" style={{ fontSize: 12, color: "#666" }}>
        로그인으로 돌아가기
      </Link>
      <pre
        style={{
          marginTop: 16,
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
          fontSize: 14,
          lineHeight: 1.7,
          color: "#222",
        }}
      >
        {md}
      </pre>
    </main>
  );
}
