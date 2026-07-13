import { describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    incident: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/og", () => ({
  ImageResponse: class MockImageResponse extends Response {
    rendered: unknown;
    options: unknown;

    constructor(rendered: unknown, options: unknown) {
      super("rendered-image", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
      this.rendered = rendered;
      this.options = options;
    }
  },
}));

import { GET } from "@/app/api/og/incident/[id]/route";

describe("incident Open Graph route", () => {
  it("renders a 1200x630 image response for a persisted incident", async () => {
    db.incident.findUnique.mockResolvedValue({
      displayName: "Serra de Monchique",
      municipality: "Monchique",
      district: "Faro",
      severity: "critical",
      status: "active",
      personnelTotal: 12,
      assetsGround: 4,
      assetsAerial: 2,
      estimatedAreaHa: 18.4,
    });

    const response = await GET(new Request("http://localhost/api/og/incident/incident-1"), {
      params: Promise.resolve({ id: "incident-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect((response as Response & { options: unknown }).options).toEqual({ width: 1200, height: 630 });
    expect(db.incident.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "incident-1" },
      select: expect.objectContaining({ displayName: true, severity: true, status: true }),
    }));
  });

  it("keeps the image response available when the incident is missing", async () => {
    db.incident.findUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/og/incident/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("redacts persistence failures behind the same not-found image state", async () => {
    db.incident.findUnique.mockRejectedValue(new Error("private database detail"));

    const response = await GET(new Request("http://localhost/api/og/incident/failing"), {
      params: Promise.resolve({ id: "failing" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const rendered = (response as Response & { rendered: unknown }).rendered;
    expect(JSON.stringify(rendered)).not.toContain("private database detail");
  });
});
