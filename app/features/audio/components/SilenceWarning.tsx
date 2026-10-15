export function SilenceWarning() {
    return (
        <div className="mb-3 text-sm text-yellow-400" role="status">
            No audio signal detected. Make sure something is playing, then check:
            <ul className="mb-0 list-disc pl-8">
                <li>
                    Windows Sound settings → Recording → Stereo Mix → Properties → <b>Levels</b>: volume should not be 0 or muted.
                </li>
                <li>Settings → Privacy & security → Microphone: allow microphone access and desktop apps.</li>
                <li>Your browser may be using a different "Stereo Mix" entry; try the others in the list.</li>
                <li>
                    Stereo Mix can't capture a device that is its own sound device (USB/HDMI/Bluetooth). Use Voicemeeter Banana
                    instead; see the setup guide under "Choose a different source".
                </li>
            </ul>
        </div>
    );
}