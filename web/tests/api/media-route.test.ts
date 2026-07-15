// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "@/lib/types";

vi.mock("@/lib/repository", () => ({
  repository: {
    getMediaByFilename: vi.fn(),
  },
}));

vi.mock("@/lib/media-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-storage")>();
  return {
    ...actual,
    mediaStorage: {
      read: vi.fn(),
    },
  };
});

import { GET } from "@/app/api/media/[filename]/route";
import { mediaStorage } from "@/lib/media-storage";
import { repository } from "@/lib/repository";

const asset: MediaAsset = {
  id: "media-1",
  filename: "asset.png",
  originalName: "asset.png",
  mimeType: "image/png",
  size: 7,
  url: "/api/media/asset.png",
  createdAt: "2026-07-15T00:00:00.000Z",
};

function getMedia(filename: string) {
  return GET(new Request(`http://localhost/api/media/${encodeURIComponent(filename)}`), {
    params: Promise.resolve({ filename }),
  });
}

describe("GET /api/media/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stored media bytes with immutable cache headers", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
    vi.mocked(repository.getMediaByFilename).mockReturnValue(asset);
    vi.mocked(mediaStorage.read).mockResolvedValue(bytes);

    const response = await getMedia("asset.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 without reading storage when no database record exists", async () => {
    vi.mocked(repository.getMediaByFilename).mockReturnValue(null);

    const response = await getMedia("missing.png");

    expect(response.status).toBe(404);
    expect(mediaStorage.read).not.toHaveBeenCalled();
  });

  it("returns 404 for an unsafe filename before querying the database", async () => {
    const response = await getMedia("../secret");

    expect(response.status).toBe(404);
    expect(repository.getMediaByFilename).not.toHaveBeenCalled();
    expect(mediaStorage.read).not.toHaveBeenCalled();
  });

  it("returns a generic 404 when the stored file is missing", async () => {
    vi.mocked(repository.getMediaByFilename).mockReturnValue(asset);
    vi.mocked(mediaStorage.read).mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file, open '/private/uploads/asset.png'"), { code: "ENOENT" }),
    );

    const response = await getMedia("asset.png");
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).not.toContain("ENOENT");
    expect(body).not.toContain("/private/uploads");
  });
});
