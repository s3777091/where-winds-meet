import { describe, expect, it } from "vitest";
import { initialMapZoom } from "./map-viewport";

describe("map viewport helpers", () => {
  it("uses the official compact zoom on mobile", () => {
    expect(initialMapZoom(11, 390)).toBe(9);
    expect(initialMapZoom(9.96, 767)).toBe(9);
  });

  it("preserves the region zoom on larger viewports", () => {
    expect(initialMapZoom(11, 768)).toBe(11);
    expect(initialMapZoom(9.96, 1440)).toBe(9.96);
  });

  it("keeps a closer region zoom when it is already below the mobile cap", () => {
    expect(initialMapZoom(8, 390)).toBe(8);
  });
});
