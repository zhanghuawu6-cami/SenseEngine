// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const prepare = vi.fn(() => ({ get }));

vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ prepare }),
}));

import { repository } from "@/lib/repository";

describe("repository.getMediaByFilename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up a filename with a parameterized query and maps the media row", () => {
    get.mockReturnValue({
      id: "media-1",
      filename: "asset.png",
      original_name: "Asset.png",
      mime_type: "image/png",
      size: 7,
      url: "/api/media/asset.png",
      created_at: "2026-07-15T00:00:00.000Z",
    });

    const result = repository.getMediaByFilename("asset.png");

    expect(prepare).toHaveBeenCalledWith("SELECT * FROM media WHERE filename = ?");
    expect(get).toHaveBeenCalledWith("asset.png");
    expect(result).toEqual({
      id: "media-1",
      filename: "asset.png",
      originalName: "Asset.png",
      mimeType: "image/png",
      size: 7,
      url: "/api/media/asset.png",
      createdAt: "2026-07-15T00:00:00.000Z",
    });
  });

  it("returns null when the filename is not recorded", () => {
    get.mockReturnValue(undefined);

    expect(repository.getMediaByFilename("missing.png")).toBeNull();
  });
});
