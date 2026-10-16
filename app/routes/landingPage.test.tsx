// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Route } from "../+types/root";
import Home, { meta } from "./landingPage";

// The page itself has its own spec; the route module only has to mount it.
vi.mock("~/features/landing/LandingPage", () => ({ LandingPage: () => <p>LandingPage stand-in</p> }));

describe("landingPage route", () => {
  it("sets the document title", () => {
    const tags = meta({} as Route.MetaArgs);

    expect(tags).toContainEqual({ title: "Audio Visualizer" });
    expect(tags).toContainEqual(expect.objectContaining({ name: "description" }));
  });

  it("renders the feature page", () => {
    render(<Home />);

    expect(screen.getByText("LandingPage stand-in")).toBeInTheDocument();
  });
});
