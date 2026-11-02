// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Route } from "../+types/root";
import DancingCharacter, { meta } from "./dancingCharacterPage";

// The page itself has its own spec; the route module only has to mount it.
vi.mock("~/features/visualizers/dancing-character/DancingCharacterPage", () => ({
  DancingCharacterPage: () => <p>DancingCharacterPage stand-in</p>,
}));

describe("dancingCharacterPage route", () => {
  it("sets the document title", () => {
    const tags = meta({} as Route.MetaArgs);

    expect(tags).toContainEqual({ title: "Audio Visualizer - Dancing Character" });
    expect(tags).toContainEqual(expect.objectContaining({ name: "description" }));
  });

  it("renders the feature page", () => {
    render(<DancingCharacter />);

    expect(screen.getByText("DancingCharacterPage stand-in")).toBeInTheDocument();
  });
});
