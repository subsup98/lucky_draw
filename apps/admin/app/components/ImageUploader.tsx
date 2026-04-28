"use client";

import { useRef, useState } from "react";
import { App, Button, Upload, Typography, Space, Modal, Switch } from "antd";
import type { RcFile, UploadProps } from "antd/es/upload";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { getAccessToken, ApiError } from "../lib/api";

/**
 * 관리자 공용 이미지 업로더 + 크롭.
 *
 * - 서버: `POST /api/admin/upload/image` (multipart, field="file")
 * - 응답: `{ url: "/uploads/xxx.png" }`
 * - 흐름: 파일 선택 → 모달에서 크롭 박스 조정 → 확정 → canvas로 잘라서 업로드.
 * - aspect prop: 비율 잠금 (예: 16/9, 1/1). 모달에 토글이 있어 자유 비율로 풀 수 있음.
 *   prop 없으면 처음부터 자유 비율.
 * - 검증: 프런트(MIME/크기) + 서버(중복 검증).
 */

const MAX_BYTES = 5 * 1024 * 1024;
const OK_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function centerInitialCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
    width,
    height,
  );
}

async function extractCroppedBlob(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  mime: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = Math.round(pixelCrop.width * scaleX);
  canvas.height = Math.round(pixelCrop.height * scaleY);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("blob 생성 실패"))),
      mime || "image/png",
      0.92,
    );
  });
}

export function ImageUploader({
  value,
  onChange,
  width = 240,
  height = 140,
  aspect,
  aspectLabel,
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  width?: number;
  height?: number;
  /** 비율 잠금 (예: 16/9, 1/1). 미지정 시 자유 비율. */
  aspect?: number | null;
  /** 모달 표기용 라벨 (예: "16:9", "1:1"). */
  aspectLabel?: string;
}) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const [cropOpen, setCropOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [freeMode, setFreeMode] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const hasAspect = typeof aspect === "number" && aspect > 0;
  const activeAspect = !freeMode && hasAspect ? aspect : undefined;

  function handleFileSelected(file: RcFile) {
    if (!OK_MIME.includes(file.type)) {
      message.error(`지원하지 않는 형식: ${file.type}`);
      return;
    }
    if (file.size > MAX_BYTES) {
      message.error("파일 크기는 5MB 를 넘을 수 없습니다.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPendingFile(file);
    setPendingSrc(url);
    setFreeMode(false);
    setCrop(undefined);
    setPixelCrop(null);
    setCropOpen(true);
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    imgRef.current = img;
    if (hasAspect) {
      setCrop(centerInitialCrop(img.width, img.height, aspect as number));
    } else {
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    }
  }

  function onFreeModeChange(checked: boolean) {
    setFreeMode(checked);
    const img = imgRef.current;
    if (!img) return;
    if (!checked && hasAspect) {
      setCrop(centerInitialCrop(img.width, img.height, aspect as number));
    }
  }

  async function uploadBlob(blob: Blob, filename: string, mime: string) {
    const form = new FormData();
    form.append("file", blob, filename);
    const token = getAccessToken();
    setUploading(true);
    try {
      const res = await fetch("/api/admin/upload/image", {
        method: "POST",
        body: form,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const bodyText = await res.text();
      const body = bodyText ? JSON.parse(bodyText) : {};
      if (!res.ok) {
        throw new ApiError(
          res.status,
          String(body?.error ?? res.status),
          body?.message ?? "업로드 실패",
        );
      }
      onChange(body.url);
      message.success("업로드 완료");
      closeCrop();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function confirmCrop() {
    if (!imgRef.current || !pendingFile) return;
    if (!pixelCrop || pixelCrop.width < 2 || pixelCrop.height < 2) {
      message.error("크롭 영역을 지정해주세요");
      return;
    }
    try {
      const mime = pendingFile.type || "image/png";
      const blob = await extractCroppedBlob(imgRef.current, pixelCrop, mime);
      await uploadBlob(blob, pendingFile.name, mime);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "크롭 처리 실패");
    }
  }

  function closeCrop() {
    if (pendingSrc) URL.revokeObjectURL(pendingSrc);
    setPendingFile(null);
    setPendingSrc(null);
    setCropOpen(false);
    setCrop(undefined);
    setPixelCrop(null);
  }

  async function remove() {
    if (!value) return;
    const filename = value.split("/").pop();
    if (!filename) return;
    const token = getAccessToken();
    try {
      await fetch(`/api/admin/upload/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      /* 디스크에서 못 지워도 참조만 끊으면 UI 목적 달성 */
    }
    onChange(null);
  }

  const uploadProps: UploadProps = {
    accept: "image/*",
    showUploadList: false,
    beforeUpload: (file: RcFile) => {
      handleFileSelected(file);
      return false;
    },
  };

  const ratioHint = aspectLabel
    ? `비율 ${aspectLabel}`
    : hasAspect
    ? `비율 ${(aspect as number).toFixed(2)}`
    : "자유 비율";

  return (
    <div>
      {value ? (
        <div
          style={{
            width,
            height,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #e5e5e5",
            position: "relative",
            background: "#fafafa",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="업로드된 이미지"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <Space style={{ position: "absolute", right: 6, top: 6 }}>
            <Upload {...uploadProps}>
              <Button size="small" loading={uploading}>
                교체
              </Button>
            </Upload>
            <Button size="small" danger onClick={remove}>
              삭제
            </Button>
          </Space>
        </div>
      ) : (
        <Upload {...uploadProps}>
          <div
            style={{
              width,
              height,
              border: "1px dashed #d9d9d9",
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: "#fafafa",
              cursor: "pointer",
              color: "#888",
            }}
          >
            <Space direction="vertical" align="center">
              <Typography.Text>{uploading ? "업로드 중..." : "+ 이미지 업로드"}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                JPG / PNG / WEBP / GIF, 5MB 이하 · {ratioHint}
              </Typography.Text>
            </Space>
          </div>
        </Upload>
      )}

      <Modal
        open={cropOpen}
        onOk={confirmCrop}
        onCancel={closeCrop}
        okText="이대로 업로드"
        cancelText="취소"
        title={`이미지 자르기${aspectLabel ? ` · ${aspectLabel} 권장` : ""}`}
        width={760}
        confirmLoading={uploading}
        destroyOnClose
      >
        {pendingSrc && (
          <Space direction="vertical" style={{ width: "100%" }}>
            {hasAspect && (
              <Space>
                <Switch checked={freeMode} onChange={onFreeModeChange} />
                <Typography.Text>
                  {freeMode ? "자유 비율" : `비율 잠금${aspectLabel ? ` (${aspectLabel})` : ""}`}
                </Typography.Text>
              </Space>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                maxHeight: 500,
                overflow: "auto",
                background: "#1a1a1a",
                borderRadius: 6,
                padding: 8,
              }}
            >
              <ReactCrop
                crop={crop}
                onChange={(_, percent) => setCrop(percent)}
                onComplete={(c) => setPixelCrop(c)}
                aspect={activeAspect}
                keepSelection
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingSrc}
                  alt="원본"
                  style={{ maxWidth: "100%", maxHeight: 480, display: "block" }}
                  onLoad={onImgLoad}
                />
              </ReactCrop>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              크롭 박스를 드래그/리사이즈해서 보일 영역을 지정하세요. 박스 안 영역만 저장됩니다.
            </Typography.Text>
          </Space>
        )}
      </Modal>
    </div>
  );
}

/**
 * Antd `<Form.Item>` 안에 그대로 꽂아 쓰는 래퍼.
 * 사용:
 *   <Form.Item name="coverImageUrl" label="커버 이미지">
 *     <ImageUploaderField aspect={16/9} aspectLabel="16:9" />
 *   </Form.Item>
 */
export function ImageUploaderField({
  value,
  onChange,
  width,
  height,
  aspect,
  aspectLabel,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  width?: number;
  height?: number;
  aspect?: number | null;
  aspectLabel?: string;
}) {
  return (
    <ImageUploader
      value={value ?? null}
      onChange={(v) => onChange?.(v)}
      width={width ?? 320}
      height={height ?? 160}
      aspect={aspect}
      aspectLabel={aspectLabel}
    />
  );
}
