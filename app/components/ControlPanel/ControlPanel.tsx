import { type ReactNode, type SyntheticEvent, useMemo, useState } from 'react';
import { ControlInput } from './ControlInput';
import { type ControlDefinition, type ControlValue, groupBySection, isModified, isShown } from './controls';
import styles from './ControlPanel.module.css';
import { PerformanceStats } from '~/components/PerformanceStats/PerformanceStats';
import { RhythmStats } from '~/components/RhythmStats/RhythmStats';
import { AudioSourceDialog } from '~/features/audio/components/AudioSourceDialog';
import { FULLSCREEN_STRINGS } from '~/features/fullscreen/strings';
import { FULLSCREEN_TOGGLE_ATTRIBUTE } from '~/features/fullscreen/types';

interface ControlPanelProps {
    definitions: readonly ControlDefinition[];
    values: Readonly<Record<string, ControlValue>>;
    onChange: (key: string, value: ControlValue) => void;
    onResetAll: () => void;
    cameraLocked: boolean;
    onCameraLockedChange: (locked: boolean) => void;
    viewChanged: boolean;
    onResetView: () => void;
    fullscreenActive?: boolean;
    // The fullscreen button only exists when the page passes this.
    onToggleFullscreen?: () => void;
    // Extra content at the top of the open panel, above the first section and outside the control table.
    header?: ReactNode;
}

export function ControlPanel({
    definitions,
    values,
    onChange,
    onResetAll,
    cameraLocked,
    onCameraLockedChange,
    viewChanged,
    onResetView,
    fullscreenActive = false,
    onToggleFullscreen,
    header,
}: ControlPanelProps) {
    const [collapsed, setCollapsed] = useState(true);
    const [showStats, setShowStats] = useState(false);
    const [showRhythm, setShowRhythm] = useState(false);
    const [audioDialogOpen, setAudioDialogOpen] = useState(false);
    const sections = useMemo(() => groupBySection(definitions), [definitions]);
    // Start with just the first section open so the panel stays short.
    const [openSections, setOpenSections] = useState<ReadonlySet<string>>(
        () => new Set(sections.slice(0, 1).map((section) => section.name)),
    );

    const onSectionToggle = (name: string, event: SyntheticEvent<HTMLDetailsElement>) => {
        const open = event.currentTarget.open;
        setOpenSections((current) => {
            if (current.has(name) === open) {
                return current;
            }
            const next = new Set(current);
            if (open) {
                next.add(name);
            } else {
                next.delete(name);
            }
            return next;
        });
    };

    const fullscreenLabel = fullscreenActive ? FULLSCREEN_STRINGS.exit : FULLSCREEN_STRINGS.enter;
    const fullscreenToggleAttribute = { [FULLSCREEN_TOGGLE_ATTRIBUTE]: '' };

    return (
        <>
            {/* Hidden rather than unmounted while fullscreen, so the open sections, stats toggles and dialog state
                survive and come back as they were. */}
            <div className={collapsed ? styles.panel : `${styles.panel} ${styles.open}`} hidden={fullscreenActive}>
                <div className={styles.bar}>
                    <button
                        type="button"
                        className={styles.lock}
                        onClick={() => onCameraLockedChange(!cameraLocked)}
                        aria-pressed={cameraLocked}
                        aria-label={cameraLocked ? 'Camera locked. Click to unlock' : 'Camera unlocked. Click to lock'}
                        title={
                            cameraLocked
                                ? 'View locked: the picture cannot be dragged, rotated or zoomed. Click to unlock it.'
                                : 'View unlocked: drag to rotate, right-drag to pan, scroll to zoom. Click to lock the view in place.'
                        }
                    >
                        {cameraLocked ? '🔒' : '🔓'}
                    </button>
                    {viewChanged && (
                        <button
                            type="button"
                            className={styles.resetView}
                            onClick={onResetView}
                            title="Reset view: put the picture back where it started"
                            aria-label="Reset view"
                        >
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M8 0v3M8 13v3M0 8h3M13 8h3" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                        </button>
                    )}
                    <button type="button" className={styles.toggle} onClick={() => setCollapsed((current) => !current)}>
                        {collapsed ? '☰ Settings' : '✕ Close'}
                    </button>
                    {onToggleFullscreen && (
                        <button
                            type="button"
                            className={styles.fullscreen}
                            onClick={onToggleFullscreen}
                            aria-label={fullscreenLabel}
                            title={fullscreenLabel}
                            {...fullscreenToggleAttribute}
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="16"
                                height="16"
                                aria-hidden="true"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                {fullscreenActive ? (
                                    <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
                                ) : (
                                    <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
                                )}
                            </svg>
                        </button>
                    )}
                </div>

                {!collapsed && (
                    <div>
                        {header}
                        {sections.map((section) => {
                            const modifiedCount = section.controls.filter((definition) =>
                                isModified(definition, values[definition.key]),
                            ).length;
                            return (
                                <details
                                    key={section.name}
                                    className={styles.section}
                                    open={openSections.has(section.name)}
                                    onToggle={(event) => onSectionToggle(section.name, event)}
                                >
                                    <summary>
                                        {section.name}
                                        {modifiedCount > 0 && (
                                            <span
                                                className={styles.modified}
                                                title="Settings changed from their defaults"
                                            >
                                                {modifiedCount} changed
                                            </span>
                                        )}
                                    </summary>
                                    {section.controls
                                        .filter((definition) => isShown(definition, values))
                                        .map((definition) => {
                                            const value = values[definition.key];
                                            return (
                                                <div key={definition.key} className={styles.controlRow}>
                                                    <label htmlFor={definition.key}>{definition.label}</label>
                                                    <ControlInput
                                                        definition={definition}
                                                        value={value}
                                                        onChange={(next) => onChange(definition.key, next)}
                                                    />
                                                    {definition.type === 'range' && (
                                                        <span className={styles.value}>{value}</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={styles.fieldReset}
                                                        title="Reset to default"
                                                        aria-label={`Reset ${definition.label} to default`}
                                                        style={{
                                                            visibility: isModified(definition, value)
                                                                ? 'visible'
                                                                : 'hidden',
                                                        }}
                                                        onClick={() => onChange(definition.key, definition.default)}
                                                    >
                                                        ↺
                                                    </button>
                                                </div>
                                            );
                                        })}
                                </details>
                            );
                        })}

                        <div className={styles.footer}>
                            <button type="button" className={styles.reset} onClick={onResetAll}>
                                Reset all
                            </button>
                            <button type="button" className={styles.reset} onClick={() => setAudioDialogOpen(true)}>
                                Audio settings
                            </button>
                            <label className={styles.statsToggle}>
                                <input
                                    type="checkbox"
                                    checked={showStats}
                                    onChange={(event) => setShowStats(event.currentTarget.checked)}
                                />{' '}
                                Show performance stats
                            </label>
                            <label className={styles.statsToggle}>
                                <input
                                    type="checkbox"
                                    checked={showRhythm}
                                    onChange={(event) => setShowRhythm(event.currentTarget.checked)}
                                />{' '}
                                Show rhythm stats
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {!fullscreenActive && showStats && <PerformanceStats />}
            {!fullscreenActive && showRhythm && <RhythmStats />}
            {!fullscreenActive && audioDialogOpen && <AudioSourceDialog onClose={() => setAudioDialogOpen(false)} />}
        </>
    );
}
