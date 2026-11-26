import { SLOW_FRAME_NOTICE_STRINGS } from './slowFrameNoticeStrings';
import { setEnhancedGraphics } from './enhancedGraphicsStore';
import { dismissSlowNotice } from './frameRateMonitor';

interface SlowFrameNoticeProps {
    // Called after either button, so the page can hide the notice.
    onClose: () => void;
}

// A non-modal note: it is a status message, never takes focus and never blocks the picture.
export function SlowFrameNotice({ onClose }: SlowFrameNoticeProps) {
    const close = () => {
        dismissSlowNotice();
        onClose();
    };
    const buttonClass = 'rounded border border-gray-400 px-2 py-1 hover:border-white';

    return (
        <div
            role="status"
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded bg-black/70 px-4 py-2 text-sm text-white"
        >
            <span>{SLOW_FRAME_NOTICE_STRINGS.message}</span>
            <button
                type="button"
                className={buttonClass}
                onClick={() => {
                    setEnhancedGraphics(false);
                    close();
                }}
            >
                {SLOW_FRAME_NOTICE_STRINGS.switchToStandard}
            </button>
            <button type="button" className={buttonClass} onClick={close}>
                {SLOW_FRAME_NOTICE_STRINGS.dismiss}
            </button>
        </div>
    );
}
