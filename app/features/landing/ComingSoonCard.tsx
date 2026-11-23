// A slim strip under the grid rather than a tile in it, so the cards always fill their rows. neutral-400 on the dark
// strip keeps the text above the 4.5:1 contrast axe checks for.
export function ComingSoonCard() {
    return (
        <div className="flex w-full items-center justify-center bg-neutral-900 py-6">
            <span className="text-xl font-bold uppercase italic tracking-wide text-neutral-400">More coming soon</span>
        </div>
    );
}
