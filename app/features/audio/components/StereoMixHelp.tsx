// Setup guide for capturing the computer's own output on Windows.
export function StereoMixHelp() {
    return (
        <details className="mt-3 rounded border border-white/20 bg-neutral-800 text-gray-100">
            <summary className="cursor-pointer px-4 py-2">How do I set up Stereo Mix?</summary>
            <div className="px-4 pb-4 text-sm [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-8 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-8">
                <p className="mb-1">Stereo Mix is a Windows recording device that carries everything your computer is playing.</p>
                <ol>
                    <li>
                        Right-click the speaker icon in the taskbar and choose <b>Sound settings</b>, then <b>More sound settings</b>{' '}
                        (under Advanced).
                    </li>
                    <li>Open the <b>Recording</b> tab.</li>
                    <li>Right-click an empty area and tick <b>Show Disabled Devices</b>.</li>
                    <li>Right-click <b>Stereo Mix</b> and choose <b>Enable</b>.</li>
                    <li>Come back here, click <b>Choose device</b>, and pick <b>Stereo Mix</b>.</li>
                </ol>
                <p className="mb-1">
                    <b>No Stereo Mix, or it stays silent?</b> Stereo Mix can't capture audio from a device that is its own sound
                    device (for example USB, HDMI or Bluetooth headsets and DACs), and many drivers hide it entirely. The most
                    reliable workaround is <b>Voicemeeter Banana</b> (free, from vb-audio.com), which acts as a virtual mixer:
                </p>
                <ol>
                    <li>Install Voicemeeter Banana and restart your computer.</li>
                    <li>
                        Open Voicemeeter. At the top right, click <b>A1</b> and choose your real speakers or headset (use the{' '}
                        <i>WDM</i> or <i>MME</i> entry).
                    </li>
                    <li>In Windows Sound settings, set your default playback device to <b>Voicemeeter Input</b>.</li>
                    <li>
                        In Voicemeeter, make sure <b>A1</b> is lit on the <i>Voicemeeter VAIO</i> strip, and also light <b>B1</b>. A1
                        sends sound to your headset, B1 sends it to this app.
                    </li>
                    <li>
                        Back here, click <b>Choose device</b> and pick <b>Voicemeeter Out B1</b> (or <b>Voicemeeter Output</b>).
                    </li>
                </ol>
                <p className="mb-1">Alternatives:</p>
                <ul className="mb-0">
                    <li>
                        A simpler virtual cable such as <b>VB-Cable</b>: set <i>CABLE Input</i> as your Windows playback device, then
                        pick <i>CABLE Output</i> here. To still hear the audio, open <i>CABLE Output</i>'s properties in the
                        Recording tab, go to <b>Listen</b>, and tick <b>Listen to this device</b> with your speakers selected.
                    </li>
                    <li>The screen/tab audio option, which needs no setup.</li>
                </ul>
            </div>
        </details>
    );
}