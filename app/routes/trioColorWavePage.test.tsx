// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Route } from "../+types/root";
import TrioColorWave, { meta } from "./trioColorWavePage";

// The page itself has its own spec; the route module only has to mount it.
vi.mock("~/features/visualizers/trio-color-wave/TrioColorWavePage", () => ({
  TrioColorWavePage: () => <p>TrioColorWavePage stand-in</p>,
}));

describe("trioColorWavePage route", () => {
  it("sets the document title", () => {
    const tags = meta({} as Route.MetaArgs);

    expect(tags).toContainEqual({ title: "Audio Visualizer - Trio Color Wave" });
    expect(tags).toContainEqual(expect.objectContaining({ name: "description" }));
  });

  it("renders the feature page", () => {
    render(<TrioColorWave />);

    expect(screen.getByText("TrioColorWavePage stand-in")).toBeInTheDocument();
  });
});
