#!/usr/bin/env node
// policy/ 하위에 privacy_policy.md 외의 파일이 staged 되면 commit 차단.
// 내부 정책 문서(보안 체크리스트, 키 회전 절차 등) 가 공개 저장소에 푸시되는 사고 방지.

import { execSync } from "node:child_process";

const ALLOW = new Set(["policy/privacy_policy.md"]);

let staged;
try {
  staged = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
} catch (e) {
  console.error("[check-policy] git diff failed:", e.message);
  process.exit(1);
}

const violations = staged.filter(
  (p) => p.startsWith("policy/") && !ALLOW.has(p),
);

if (violations.length > 0) {
  console.error(
    "\n[check-policy] 다음 파일은 staged 될 수 없습니다 (policy/ 하위 비공개 문서):",
  );
  for (const v of violations) console.error("  - " + v);
  console.error(
    "\n허용 파일: " +
      [...ALLOW].join(", ") +
      "\n비공개 정책을 의도적으로 추적하려면 scripts/check-policy.mjs 의 ALLOW 를 수정하세요.\n",
  );
  process.exit(1);
}
