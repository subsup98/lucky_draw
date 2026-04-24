"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Form, Input, Space, Tabs, Typography } from "antd";
import { api, ApiError } from "../lib/api";

type LoginResponse =
  | {
      stage: "ENROLL_REQUIRED";
      challengeToken: string;
      otpauthUrl: string;
      qrDataUrl: string;
    }
  | { stage: "TOTP_REQUIRED"; challengeToken: string };

type EnrollResponse = { accessToken: string; backupCodes: string[] };
type VerifyResponse = { accessToken: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"login" | "enroll" | "totp">("login");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(values: { username: string; password: string }) {
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setChallengeToken(res.challengeToken);
      if (res.stage === "ENROLL_REQUIRED") {
        setQrDataUrl(res.qrDataUrl);
        setOtpauthUrl(res.otpauthUrl);
        setStage("enroll");
      } else {
        setStage("totp");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onEnroll(values: { code: string }) {
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api<EnrollResponse>("/api/admin/auth/totp/enroll", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: values.code }),
      });
      setBackupCodes(res.backupCodes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "TOTP 등록 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(values: { code: string }) {
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await api<VerifyResponse>("/api/admin/auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: values.code }),
      });
      router.push("/audit-logs");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "TOTP 검증 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onBackup(values: { code: string }) {
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await api<VerifyResponse>("/api/admin/auth/backup-code", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: values.code }),
      });
      router.push("/audit-logs");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "백업 코드 검증 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f5f5" }}>
      <Card style={{ width: 420 }} title="관리자 로그인">
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

        {stage === "login" && (
          <Form layout="vertical" onFinish={onLogin}>
            <Form.Item label="아이디" name="username" rules={[{ required: true }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item label="비밀번호" name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              로그인
            </Button>
          </Form>
        )}

        {stage === "enroll" && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {!backupCodes ? (
              <>
                <Typography.Paragraph>
                  최초 로그인입니다. Authenticator 앱으로 QR을 스캔한 뒤 6자리 코드를 입력하세요.
                </Typography.Paragraph>
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="TOTP QR" style={{ width: 200, height: 200 }} />
                )}
                {otpauthUrl && (
                  <Typography.Text code copyable style={{ fontSize: 11, wordBreak: "break-all" }}>
                    {otpauthUrl}
                  </Typography.Text>
                )}
                <Form layout="vertical" onFinish={onEnroll}>
                  <Form.Item label="TOTP 코드 (6자리)" name="code" rules={[{ required: true, len: 6 }]}>
                    <Input maxLength={6} inputMode="numeric" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    등록 완료
                  </Button>
                </Form>
              </>
            ) : (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message="아래 백업 코드를 안전한 곳에 보관하세요. 다시 표시되지 않습니다."
                />
                <pre style={{ background: "#fafafa", padding: 12, borderRadius: 4 }}>
                  {backupCodes.join("\n")}
                </pre>
                <Button type="primary" block onClick={() => router.push("/audit-logs")}>
                  대시보드로 이동
                </Button>
              </>
            )}
          </Space>
        )}

        {stage === "totp" && (
          <Tabs
            items={[
              {
                key: "totp",
                label: "TOTP",
                children: (
                  <Form layout="vertical" onFinish={onVerify}>
                    <Form.Item label="TOTP 코드 (6자리)" name="code" rules={[{ required: true, len: 6 }]}>
                      <Input maxLength={6} inputMode="numeric" autoFocus />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading}>
                      검증
                    </Button>
                  </Form>
                ),
              },
              {
                key: "backup",
                label: "백업 코드",
                children: (
                  <Form layout="vertical" onFinish={onBackup}>
                    <Form.Item label="백업 코드 (xxxx-xxxx-xxxx)" name="code" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading}>
                      검증
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        )}
      </Card>
    </main>
  );
}
