import { describe, expect, it } from "vitest";
import { parseBbox } from "@/app/api/aerial/route";
import { GET as riskGet } from "@/app/api/risk/route";
import { NextRequest } from "next/server";

describe("public API input boundaries", () => {
  it("rejects non-finite and out-of-Portugal aerial bboxes", () => {
    expect(parseBbox("0,0,1,Infinity")).toBeNull();
    expect(parseBbox("-9.5,36.95,-6,42.15")).toEqual([-9.5, 36.95, -6, 42.15]);
    expect(parseBbox("-20,36,-6,42")).toBeNull();
    expect(parseBbox("-6,42,-9,36")).toBeNull();
  });

  it("rejects non-finite risk coordinates before upstream work", async () => {
    const response = await riskGet(new NextRequest("http://localhost/api/risk?lat=Infinity&lon=-9"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "lat and lon must be finite Portugal coordinates" });
  });
});
