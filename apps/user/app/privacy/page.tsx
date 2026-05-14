import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "개인정보처리방침 - lucky_draw",
};

function loadPolicy(): string {
  const p = path.join(process.cwd(), "..", "..", "policy", "privacy_policy.md");
  return fs.readFileSync(p, "utf8");
}

export default function PrivacyPage() {
  const md = loadPolicy();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-gray-500 underline">
        ← 홈으로
      </Link>
      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-gray-800">
        {md}
      </pre>
    </main>
  );
}
