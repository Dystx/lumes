import { describe, expect, it } from "vitest";
import { createNewsletterActionToken, readNewsletterActionToken } from "@/lib/newsletter-token";

describe("newsletter action tokens", () => {
  it("round-trips and expires signed tokens", () => {
    const token = createNewsletterActionToken("hash", 1_000);
    expect(readNewsletterActionToken(token, 1_001)).toBe("hash");
    expect(readNewsletterActionToken(token, 86_401_001)).toBeNull();
  });

  it("rejects tampering", () => {
    const token = createNewsletterActionToken("hash", 1_000);
    expect(readNewsletterActionToken(`${token}x`, 1_001)).toBeNull();
  });
});
