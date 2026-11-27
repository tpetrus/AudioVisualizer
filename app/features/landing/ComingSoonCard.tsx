// A slim strip under the grid rather than a tile in it, so the cards always fill their rows. The muted text on the
// surface keeps the contrast above the 4.5:1 axe checks for.
export function ComingSoonCard() {
    return (
        <div className="flex w-full items-center justify-center bg-surface-1 py-6">
            <span className="text-xl font-bold uppercase italic tracking-wide text-text-muted">More coming soon</span>
        </div>
    );
}
