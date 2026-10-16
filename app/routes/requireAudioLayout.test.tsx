// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { FakeAudioEngine } from "~/test/fakeEngines";
import { asWebAudio } from "~/test/fakeWebAudio";
import { renderWithProviders } from "~/test/renderWithProviders";
import RequireAudioLayout from "./requireAudioLayout";

function renderLayout(engine: FakeAudioEngine) {
  return renderWithProviders(
    <Routes>
      <Route element={<RequireAudioLayout />}>
        <Route path="/cubes" element={<p>cubes page</p>} />
      </Route>
      <Route path="/" element={<p>landing page</p>} />
    </Routes>,
    { engine, route: "/cubes" },
  );
}

describe("RequireAudioLayout route", () => {
  it("renders the child route while audio is capturing", () => {
    const engine = new FakeAudioEngine();
    engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    renderLayout(engine);

    expect(screen.getByText("cubes page")).toBeInTheDocument();
  });

  it("redirects to the landing page when no source can be resumed", async () => {
    const engine = new FakeAudioEngine();
    engine.resumeSavedSource.mockResolvedValue(false);
    renderLayout(engine);
    await act(async () => {});

    expect(screen.getByText("landing page")).toBeInTheDocument();
    expect(screen.queryByText("cubes page")).not.toBeInTheDocument();
  });
});
