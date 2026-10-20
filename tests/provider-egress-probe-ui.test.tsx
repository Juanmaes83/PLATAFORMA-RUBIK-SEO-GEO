import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openseo/actions", () => ({
  testConnectionAction: vi.fn(),
}));
vi.mock("@/lib/openseo/google/capture-actions", () => ({ captureGoogleAction: vi.fn() }));
import { ProviderEgressProbe } from "@/components/ProviderEgressProbe";

describe("Preview provider egress probe", () => {
  it("exposes only the existing authenticated Server Actions and explains that providers stay off", () => {
    const html = renderToStaticMarkup(<ProviderEgressProbe tenant="tenant-a" project="project-a1" />);
    expect(html).toContain("Comprobar guarda OpenSEO");
    expect(html).toContain("Comprobar guarda Google");
    expect(html).toContain("No activan OpenSEO ni consultan Google");
    expect(html).toContain('name="tenant" value="tenant-a"');
    expect(html).toContain('name="project" value="project-a1"');
    expect(html).not.toContain("endpoint");
    expect(html).not.toContain("apiKey");
  });
});
