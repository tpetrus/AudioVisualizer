// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Route } from "../+types/root";
import BassInk, { meta } from "./bassInkPage";

// The page itself has its own spec; the route module only has to mount it.
vi.mock("~/features/visualizers/bass-ink/BassInkPage", () => ({ BassInkPage: () => <p>BassInkPage stand-in</p> }));

describe("bassInkPage route", () => {
  it("sets the document title", () => {
    const tags = meta({} as Route.MetaArgs);

    expect(tags).toContainEqual({ title: "Audio Visualizer - Bass ink" });
    expect(tags).toContainEqual(expect.objectContaining({ name: "description" }));
  });

  it("renders the feature page", () => {
    render(<BassInk />);

    expect(screen.getByText("BassInkPage stand-in")).toBeInTheDocument();
  });
});
