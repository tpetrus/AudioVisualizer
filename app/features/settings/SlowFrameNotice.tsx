import { Button } from '~/components/ui';
import { SLOW_FRAME_NOTICE_STRINGS } from './slowFrameNoticeStrings';
import { setEnhancedGraphics } from './enhancedGraphicsStore';
import { dismissSlowNotice } from './frameRateMonitor';

interface SlowFrameNoticeProps {
    // Called after either button, so the page can hide the notice.
    onClose: () => void;
}

// A non-modal note that never takes focus and never blocks the picture. The page wraps it in a persistent
// role="status" region so the message is announced.
export function SlowFrameNotice({ onClose }: SlowFrameNoticeProps) {
    const close = () => {
        dismissSlowNotice();
        onClose();
    };

    return (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-ui border border-border bg-surface-1/90 px-4 py-2 text-sm text-text">
            <span>{SLOW_FRAME_NOTICE_STRINGS.message}</span>
            <Button
                size="sm"
                onClick={() => {
                    setEnhancedGraphics(false);
                    close();
                }}
            >
                {SLOW_FRAME_NOTICE_STRINGS.switchToStandard}
            </Button>
            <Button size="sm" onClick={close}>
                {SLOW_FRAME_NOTICE_STRINGS.dismiss}
            </Button>
        </div>
    );
}
