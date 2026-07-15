// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "@/lib/types";

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return {
    ...actual,
    protectAdmin: vi.fn(),
  };
});

vi.mock("@/lib/repository", () => ({
  repository: {
    createMedia: vi.fn(),
    deleteMedia: vi.fn(),
    getMedia: vi.fn(),
    listMedia: vi.fn(),
  },
}));

vi.mock("@/lib/media-storage", () => ({
  mediaStorage: {
    write: vi.fn(),
    delete: vi.fn(),
  },
}));

import { DELETE } from "@/app/api/admin/media/[id]/route";
import { POST } from "@/app/api/admin/media/route";
import fs from "node:fs/promises";
import { protectAdmin } from "@/lib/http";
import { mediaStorage } from "@/lib/media-storage";
import { repository } from "@/lib/repository";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadRequest(name = "nested/Asset.png") {
  const formData = new FormData();
  formData.set("file", new File([png], name, { type: "image/png" }));
  return new Request("http://localhost/api/admin/media", { method: "POST", body: formData });
}

describe("admin media storage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protectAdmin).mockResolvedValue(null);
  });

  it("uploads through media storage and records the routed public URL", async () => {
    vi.mocked(repository.createMedia).mockImplementation((input) => ({
      ...input,
      id: "media-1",
      createdAt: "2026-07-15T00:00:00.000Z",
    }));

    const response = await POST(uploadRequest());
    const [filename, content] = vi.mocked(mediaStorage.write).mock.calls[0];

    expect(response.status).toBe(201);
    expect(filename).toMatch(/^[0-9a-f-]+\.png$/);
    expect(content).toEqual(png);
    expect(repository.createMedia).toHaveBeenCalledWith({
      filename,
      originalName: "Asset.png",
      mimeType: "image/png",
      size: png.length,
      url: `/api/media/${filename}`,
    });
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("deletes the stored upload when the database insert conflicts", async () => {
    vi.mocked(repository.createMedia).mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: media.filename");
    });

    const response = await POST(uploadRequest("Asset.png"));
    const [filename] = vi.mocked(mediaStorage.write).mock.calls[0];

    expect(response.status).toBe(409);
    expect(mediaStorage.delete).toHaveBeenCalledWith(filename);
  });

  it("deletes the database record before deleting through media storage", async () => {
    const asset: MediaAsset = {
      id: "media-1",
      filename: "asset.png",
      originalName: "Asset.png",
      mimeType: "image/png",
      size: png.length,
      url: "/api/media/asset.png",
      createdAt: "2026-07-15T00:00:00.000Z",
    };
    vi.mocked(repository.getMedia).mockReturnValue(asset);
    vi.mocked(repository.deleteMedia).mockReturnValue(true);

    const response = await DELETE(
      new Request("http://localhost/api/admin/media/media-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "media-1" }) },
    );

    expect(response.status).toBe(200);
    expect(repository.deleteMedia).toHaveBeenCalledWith("media-1");
    expect(mediaStorage.delete).toHaveBeenCalledWith("asset.png");
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(vi.mocked(repository.deleteMedia).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(mediaStorage.delete).mock.invocationCallOrder[0]);
  });
});
