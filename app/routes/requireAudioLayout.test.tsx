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

  it("asks for a source in a required dialog when none can be resumed, with a way back home", async () => {
    const engine = new FakeAudioEngine();
    engine.resumeSavedSource.mockResolvedValue(false);
    const { user } = renderLayout(engine);
    await act(async () => {});

    expect(screen.getByRole("dialog", { name: "Audio source" })).toBeInTheDocument();
    expect(screen.queryByText("cubes page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to home" }));
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("renders the child route once a source starts from the dialog", async () => {
    const engine = new FakeAudioEngine();
    engine.resumeSavedSource.mockResolvedValue(false);
    engine.startScreenCapture.mockImplementation(async () => {
      engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    });
    const { user } = renderLayout(engine);
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: "Share audio" }));

    expect(screen.getByText("cubes page")).toBeInTheDocument();
  });
});
