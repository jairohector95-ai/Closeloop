import { describe, expect, it } from "vitest";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { TONES } from "@/lib/constants";

const base = {
  customerName: "Sarah Mitchell",
  businessName: "ABC Painting",
  ownerName: "Mike",
  serviceDescription: "Interior painting",
  amount: 2850,
  quoteNumber: "EST-1001",
  sequenceLength: 3,
};

describe("email templates", () => {
  it("renders every tone and sequence position with the right variables", () => {
    for (const tone of TONES) {
      for (const n of [1, 2, 3]) {
        const email = renderFollowUpEmail({ ...base, tone: tone.id, sequenceNumber: n });
        expect(email.subject.length).toBeGreaterThan(5);
        expect(email.body).toContain("Sarah");
        expect(email.body).toContain("ABC Painting");
        expect(email.body).toContain("Mike");
        expect(email.body.toLowerCase()).toContain("interior painting");
        expect(email.body).not.toMatch(/\{\{|undefined|null/);
      }
    }
  });

  it("uses the last-note wording only for the final follow-up", () => {
    const middle = renderFollowUpEmail({ ...base, tone: "friendly", sequenceNumber: 2, sequenceLength: 3 });
    const last = renderFollowUpEmail({ ...base, tone: "friendly", sequenceNumber: 3, sequenceLength: 3 });
    expect(middle.body).not.toMatch(/last note/i);
    expect(last.body).toMatch(/last note/i);
  });

  it("appends an optional signature", () => {
    const email = renderFollowUpEmail({ ...base, tone: "professional", sequenceNumber: 1, signature: "(555) 100-2000" });
    expect(email.body.trim().endsWith("(555) 100-2000")).toBe(true);
  });
});
