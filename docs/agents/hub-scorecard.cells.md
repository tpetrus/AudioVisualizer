# Scorecard

Targets version 9, revision 86a802c, created 2026-11-22T01:46:46.063Z.

Pre-hub is the same metric with the gate fed the pre-hub input; where it is blank the rhythm DSP is unchanged since the commit before the hub merge, so the pre-hub value equals the value shown.

Applicable cells 443: 390 passing, 27 failing, 26 unavailable. Blocking failures: 13.

## ac9

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| ac9.dottedChangeCounted | scenario:dotted-100-150 | synthetic | 0 | 1 | - | - | fail |
| ac9.dottedPassageQuiet | scenario:dotted-passage | synthetic | 0 | 0 | - | - | pass |

## beat

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| beat.errorMedianMs | 6-8-time.wav | tapped | - | 40.0 | - | - | fail |
| beat.errorMedianMs | bassline-kick-120.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | beatless.wav | beatless | - | 40.0 | - | - | n/a |
| beat.errorMedianMs | click-120.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | click-140.wav | synthetic | 0.8 | 20.0 | - | - | pass |
| beat.errorMedianMs | click-174.wav | synthetic | 1.7 | 20.0 | - | - | pass |
| beat.errorMedianMs | click-90.wav | synthetic | 2.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | drifting-tempo.wav | drifting | 38.0 | 40.0 | - | - | pass |
| beat.errorMedianMs | drums-100.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | drums-128.wav | synthetic | 2.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | drums-150.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | half-time-shuffle.wav | tapped | 22.6 | 40.0 | - | - | pass |
| beat.errorMedianMs | high-bpm-dnb.wav | tapped | 21.5 | 40.0 | - | - | pass |
| beat.errorMedianMs | imyourgirl.wav | tapped | 23.8 | 40.0 | - | - | pass |
| beat.errorMedianMs | lonley.wav | tapped | 25.9 | 40.0 | - | - | pass |
| beat.errorMedianMs | low-bpm-rnb.wav | tapped | 183.4 | 40.0 | - | - | fail |
| beat.errorMedianMs | no-kick-124.wav | synthetic | 1.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | pad-lead-groove-110.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | summer2000.wav | tapped | 153.4 | 40.0 | - | - | fail |
| beat.errorMedianMs | syncopation-no-kick.wav | tapped | 29.9 | 40.0 | - | - | pass |
| beat.errorMedianMs | syncopationbass.wav | tapped | 35.7 | 40.0 | - | - | pass |
| beat.errorMedianMs | syncopationbass2.wav | tapped | 18.7 | 40.0 | - | - | pass |
| beat.errorMedianMs | trap-2to1-double-90.wav | synthetic | 2.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | trap-2to1-half-140.wav | synthetic | 3.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | trap-4to3-120.wav | synthetic | 1.6 | 20.0 | - | - | pass |

## cubes

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| cubes.hit.share50ms | 6-8-time.wav | tapped | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | bassline-kick-120.wav | synthetic | 0.780 | - | 0.900 | 0.780 | pass |
| cubes.hit.share50ms | beatless.wav | beatless | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-120.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-140.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-174.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-90.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | drifting-tempo.wav | drifting | 0.125 | - | 0.900 | 0.125 | pass |
| cubes.hit.share50ms | drums-100.wav | synthetic | 0.265 | - | 0.900 | 0.265 | pass |
| cubes.hit.share50ms | drums-128.wav | synthetic | 0.270 | - | 0.900 | 0.270 | pass |
| cubes.hit.share50ms | drums-150.wav | synthetic | 0.479 | - | 0.900 | 0.479 | pass |
| cubes.hit.share50ms | half-time-shuffle.wav | tapped | 0.378 | - | 0.900 | 0.378 | pass |
| cubes.hit.share50ms | high-bpm-dnb.wav | tapped | 0.000 | - | 0.900 | 0.000 | pass |
| cubes.hit.share50ms | imyourgirl.wav | tapped | 0.553 | - | 0.900 | 0.553 | pass |
| cubes.hit.share50ms | lonley.wav | tapped | 0.138 | - | 0.900 | 0.138 | pass |
| cubes.hit.share50ms | low-bpm-rnb.wav | tapped | 0.171 | - | 0.900 | 0.171 | pass |
| cubes.hit.share50ms | no-kick-124.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | pad-lead-groove-110.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | summer2000.wav | tapped | 0.034 | - | 0.900 | 0.034 | pass |
| cubes.hit.share50ms | syncopation-no-kick.wav | tapped | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | syncopationbass.wav | tapped | 0.179 | - | 0.900 | 0.179 | pass |
| cubes.hit.share50ms | syncopationbass2.wav | tapped | 0.629 | - | 0.900 | 0.629 | pass |
| cubes.hit.share50ms | trap-2to1-double-90.wav | synthetic | 1.000 | - | 0.900 | 1.000 | pass |
| cubes.hit.share50ms | trap-2to1-half-140.wav | synthetic | 0.507 | - | 0.900 | 0.507 | pass |
| cubes.hit.share50ms | trap-4to3-120.wav | synthetic | 0.492 | - | 0.900 | 0.492 | pass |
| cubes.reaction.latencyMs | 6-8-time.wav | tapped | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | bassline-kick-120.wav | synthetic | 33.3 | - | 46.7 | 33.3 | pass |
| cubes.reaction.latencyMs | beatless.wav | beatless | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-120.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-140.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-174.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-90.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | drifting-tempo.wav | drifting | 224.0 | - | 46.7 | 224.0 | pass |
| cubes.reaction.latencyMs | drums-100.wav | synthetic | 16.7 | - | 46.7 | 16.7 | pass |
| cubes.reaction.latencyMs | drums-128.wav | synthetic | 29.2 | - | 46.7 | 29.2 | pass |
| cubes.reaction.latencyMs | drums-150.wav | synthetic | 33.3 | - | 46.7 | 33.3 | pass |
| cubes.reaction.latencyMs | half-time-shuffle.wav | tapped | 40.7 | - | 46.7 | 40.7 | pass |
| cubes.reaction.latencyMs | high-bpm-dnb.wav | tapped | 104.7 | - | 46.7 | 104.7 | pass |
| cubes.reaction.latencyMs | imyourgirl.wav | tapped | 46.7 | - | 46.7 | 46.7 | pass |
| cubes.reaction.latencyMs | lonley.wav | tapped | 50.0 | - | 46.7 | 50.0 | pass |
| cubes.reaction.latencyMs | low-bpm-rnb.wav | tapped | 16.7 | - | 46.7 | 16.7 | pass |
| cubes.reaction.latencyMs | no-kick-124.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | pad-lead-groove-110.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | summer2000.wav | tapped | 163.3 | - | 46.7 | 163.3 | pass |
| cubes.reaction.latencyMs | syncopation-no-kick.wav | tapped | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | syncopationbass.wav | tapped | 74.7 | - | 46.7 | 74.7 | pass |
| cubes.reaction.latencyMs | syncopationbass2.wav | tapped | 46.0 | - | 46.7 | 46.0 | pass |
| cubes.reaction.latencyMs | trap-2to1-double-90.wav | synthetic | 33.3 | - | 46.7 | 33.3 | pass |
| cubes.reaction.latencyMs | trap-2to1-half-140.wav | synthetic | 14.3 | - | 46.7 | 14.3 | pass |
| cubes.reaction.latencyMs | trap-4to3-120.wav | synthetic | 33.3 | - | 46.7 | 33.3 | pass |

## gate

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| gate.closedOnNoKick | 6-8-time.wav | tapped | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | bassline-kick-120.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | beatless.wav | beatless | - | - | - | - | n/a |
| gate.closedOnNoKick | click-120.wav | synthetic | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | click-140.wav | synthetic | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | click-174.wav | synthetic | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | click-90.wav | synthetic | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | drifting-tempo.wav | drifting | - | - | - | - | n/a |
| gate.closedOnNoKick | drums-100.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | drums-128.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | drums-150.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | half-time-shuffle.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | high-bpm-dnb.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | imyourgirl.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | lonley.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | low-bpm-rnb.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | no-kick-124.wav | synthetic | 1 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | pad-lead-groove-110.wav | synthetic | 1 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | summer2000.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | syncopation-no-kick.wav | tapped | 1 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | syncopationbass.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | syncopationbass2.wav | tapped | - | - | - | - | n/a |
| gate.closedOnNoKick | trap-2to1-double-90.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | trap-2to1-half-140.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | trap-4to3-120.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | 6-8-time.wav | tapped | - | - | - | - | n/a |
| gate.firstOpenSeconds | bassline-kick-120.wav | synthetic | 6.97 | - | - | 6.97 | pass (report-only) |
| gate.firstOpenSeconds | beatless.wav | beatless | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-120.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-140.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-174.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-90.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | drifting-tempo.wav | drifting | 6.57 | - | - | 6.57 | pass (report-only) |
| gate.firstOpenSeconds | drums-100.wav | synthetic | 6.52 | - | - | 6.52 | pass (report-only) |
| gate.firstOpenSeconds | drums-128.wav | synthetic | 5.95 | - | - | 5.95 | pass (report-only) |
| gate.firstOpenSeconds | drums-150.wav | synthetic | 6.13 | - | - | 6.13 | pass (report-only) |
| gate.firstOpenSeconds | half-time-shuffle.wav | tapped | 18.58 | - | - | 18.58 | pass (report-only) |
| gate.firstOpenSeconds | high-bpm-dnb.wav | tapped | 10.07 | - | - | 10.07 | pass (report-only) |
| gate.firstOpenSeconds | imyourgirl.wav | tapped | 3.28 | - | - | 3.28 | pass (report-only) |
| gate.firstOpenSeconds | lonley.wav | tapped | 18.97 | - | - | 18.97 | pass (report-only) |
| gate.firstOpenSeconds | low-bpm-rnb.wav | tapped | - | - | - | - | pass (report-only) |
| gate.firstOpenSeconds | no-kick-124.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | pad-lead-groove-110.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | summer2000.wav | tapped | 14.23 | - | - | 14.23 | pass (report-only) |
| gate.firstOpenSeconds | syncopation-no-kick.wav | tapped | - | - | - | - | n/a |
| gate.firstOpenSeconds | syncopationbass.wav | tapped | 4.87 | - | - | 4.87 | pass (report-only) |
| gate.firstOpenSeconds | syncopationbass2.wav | tapped | 4.93 | - | - | 4.93 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-double-90.wav | synthetic | 6.20 | - | - | 6.20 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-half-140.wav | synthetic | 3.95 | - | - | 3.95 | pass (report-only) |
| gate.firstOpenSeconds | trap-4to3-120.wav | synthetic | 8.90 | - | - | 8.90 | pass (report-only) |
| gate.secondsAfterLock | 6-8-time.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | bassline-kick-120.wav | synthetic | 3.83 | 4.00 | 2.00 | 3.83 | pass |
| gate.secondsAfterLock | beatless.wav | beatless | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-120.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-140.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-174.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-90.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | drifting-tempo.wav | drifting | 3.40 | 4.00 | 2.00 | 3.40 | pass |
| gate.secondsAfterLock | drums-100.wav | synthetic | 3.38 | 4.00 | 2.00 | 3.38 | pass |
| gate.secondsAfterLock | drums-128.wav | synthetic | 2.82 | 4.00 | 2.00 | 2.82 | pass |
| gate.secondsAfterLock | drums-150.wav | synthetic | 3.00 | 4.00 | 2.00 | 3.00 | pass |
| gate.secondsAfterLock | half-time-shuffle.wav | tapped | 7.18 | 4.00 | 2.00 | 7.18 | fail |
| gate.secondsAfterLock | high-bpm-dnb.wav | tapped | 1.93 | 4.00 | 2.00 | 1.93 | pass |
| gate.secondsAfterLock | imyourgirl.wav | tapped | 0.15 | 4.00 | 2.00 | 0.15 | pass |
| gate.secondsAfterLock | lonley.wav | tapped | 10.83 | 4.00 | 2.00 | 10.83 | fail |
| gate.secondsAfterLock | low-bpm-rnb.wav | tapped | - | 4.00 | 2.00 | - | fail |
| gate.secondsAfterLock | no-kick-124.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | pad-lead-groove-110.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | summer2000.wav | tapped | 6.10 | 4.00 | 2.00 | 6.10 | fail |
| gate.secondsAfterLock | syncopation-no-kick.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | syncopationbass.wav | tapped | 1.73 | 4.00 | 2.00 | 1.73 | pass |
| gate.secondsAfterLock | syncopationbass2.wav | tapped | 1.80 | 4.00 | 2.00 | 1.80 | pass |
| gate.secondsAfterLock | trap-2to1-double-90.wav | synthetic | 3.07 | 4.00 | 2.00 | 3.07 | pass |
| gate.secondsAfterLock | trap-2to1-half-140.wav | synthetic | 0.77 | 4.00 | 2.00 | 0.77 | pass |
| gate.secondsAfterLock | trap-4to3-120.wav | synthetic | 0.77 | 4.00 | 2.00 | 0.77 | pass |

## live

Median over the runs; spread is max minus min; advisory (decision D13).

| Metric | Track | Visualizer | Class | Median | Spread | Runs | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| live.clip.maxDeviationBeats | 6-8-time.wav | dancing-character | tapped | - | 0.000 | 0 | 0.200 | - | - | unavailable (advisory) |
| live.clip.maxDeviationBeats | bassline-kick-120.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | beatless.wav | dancing-character | beatless | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | click-120.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | click-140.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | click-174.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | click-90.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | drifting-tempo.wav | dancing-character | drifting | 0.023 | 0.025 | 4 | 0.200 | - | - | pass (advisory) |
| live.clip.maxDeviationBeats | drums-100.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | drums-128.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | drums-150.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | half-time-shuffle.wav | dancing-character | tapped | 0.031 | 0.016 | 4 | 0.200 | - | - | pass (advisory) |
| live.clip.maxDeviationBeats | high-bpm-dnb.wav | dancing-character | tapped | - | 0.000 | 0 | 0.200 | - | - | unavailable (advisory) |
| live.clip.maxDeviationBeats | imyourgirl.wav | dancing-character | tapped | 0.027 | 0.019 | 4 | 0.200 | - | - | pass (advisory) |
| live.clip.maxDeviationBeats | lonley.wav | dancing-character | tapped | 0.026 | 0.016 | 4 | 0.200 | - | - | pass (advisory) |
| live.clip.maxDeviationBeats | low-bpm-rnb.wav | dancing-character | tapped | - | 0.000 | 0 | 0.200 | - | - | unavailable (advisory) |
| live.clip.maxDeviationBeats | no-kick-124.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | summer2000.wav | dancing-character | tapped | - | 0.000 | 0 | 0.200 | - | - | unavailable (advisory) |
| live.clip.maxDeviationBeats | syncopation-no-kick.wav | dancing-character | tapped | 0.141 | 0.205 | 4 | 0.200 | - | - | fail (advisory) |
| live.clip.maxDeviationBeats | syncopationbass.wav | dancing-character | tapped | - | 0.000 | 0 | 0.200 | - | - | unavailable (advisory) |
| live.clip.maxDeviationBeats | syncopationbass2.wav | dancing-character | tapped | 0.040 | 0.257 | 4 | 0.200 | - | - | pass (advisory) |
| live.clip.maxDeviationBeats | trap-2to1-double-90.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | trap-2to1-half-140.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.clip.maxDeviationBeats | trap-4to3-120.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.200 | - | - | n/a |
| live.falseFire.share | 6-8-time.wav | cubes | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | 6-8-time.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | bassline-kick-120.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | unavailable (advisory) |
| live.falseFire.share | bassline-kick-120.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | unavailable (advisory) |
| live.falseFire.share | beatless.wav | cubes | beatless | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | beatless.wav | dancing-character | beatless | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-120.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-120.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-120.wav | trio-color-wave | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-140.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-140.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-174.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-174.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-90.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | click-90.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | drifting-tempo.wav | bass-ink | drifting | 0.385 | 0.100 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | drifting-tempo.wav | cubes | drifting | 0.855 | 0.083 | 4 | - | 0.100 | 0.882 | pass (advisory) |
| live.falseFire.share | drifting-tempo.wav | dancing-character | drifting | 0.526 | 0.135 | 4 | - | 0.100 | 0.529 | pass (advisory) |
| live.falseFire.share | drifting-tempo.wav | trio-color-wave | drifting | 0.656 | 0.052 | 4 | - | 0.100 | 0.667 | pass (advisory) |
| live.falseFire.share | drums-100.wav | bass-ink | synthetic | 0.000 | 0.000 | 3 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | drums-100.wav | cubes | synthetic | 0.745 | 0.016 | 4 | - | 0.100 | 0.750 | pass (advisory) |
| live.falseFire.share | drums-100.wav | dancing-character | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | 1.000 | pass (advisory) |
| live.falseFire.share | drums-100.wav | trio-color-wave | synthetic | 0.735 | 0.000 | 4 | - | 0.100 | 0.735 | pass (advisory) |
| live.falseFire.share | drums-128.wav | bass-ink | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | drums-128.wav | cubes | synthetic | 0.644 | 0.036 | 4 | - | 0.100 | 0.652 | pass (advisory) |
| live.falseFire.share | drums-128.wav | dancing-character | synthetic | 0.020 | 0.149 | 4 | - | 0.100 | 0.042 | pass (advisory) |
| live.falseFire.share | drums-128.wav | trio-color-wave | synthetic | 0.638 | 0.028 | 4 | - | 0.100 | 0.653 | pass (advisory) |
| live.falseFire.share | drums-150.wav | bass-ink | synthetic | - | 0.000 | 0 | - | 0.100 | - | unavailable (advisory) |
| live.falseFire.share | drums-150.wav | cubes | synthetic | 0.361 | 0.037 | 4 | - | 0.100 | 0.383 | pass (advisory) |
| live.falseFire.share | drums-150.wav | dancing-character | synthetic | 0.018 | 0.019 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | drums-150.wav | trio-color-wave | synthetic | 0.486 | 0.014 | 4 | - | 0.100 | 0.493 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | bass-ink | tapped | 0.714 | 0.120 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | cubes | tapped | 0.785 | 0.025 | 4 | - | 0.100 | 0.773 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | dancing-character | tapped | 0.796 | 0.113 | 4 | - | 0.100 | 0.792 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | trio-color-wave | tapped | 0.738 | 0.045 | 4 | - | 0.100 | 0.722 | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | bass-ink | tapped | 0.939 | 0.004 | 3 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | cubes | tapped | 0.892 | 0.087 | 4 | - | 0.100 | 0.935 | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | dancing-character | tapped | 0.870 | 0.000 | 1 | - | 0.100 | - | unavailable (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | trio-color-wave | tapped | 0.830 | 0.095 | 4 | - | 0.100 | 0.850 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | bass-ink | tapped | 0.423 | 0.101 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | cubes | tapped | 0.484 | 0.074 | 4 | - | 0.100 | 0.478 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | dancing-character | tapped | 0.488 | 0.061 | 4 | - | 0.100 | 0.455 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | trio-color-wave | tapped | 0.233 | 0.061 | 4 | - | 0.100 | 0.258 | pass (advisory) |
| live.falseFire.share | lonley.wav | bass-ink | tapped | 1.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | lonley.wav | cubes | tapped | 0.755 | 0.036 | 4 | - | 0.100 | 0.817 | pass (advisory) |
| live.falseFire.share | lonley.wav | dancing-character | tapped | 1.000 | 0.000 | 4 | - | 0.100 | 0.474 | pass (advisory) |
| live.falseFire.share | lonley.wav | trio-color-wave | tapped | 0.667 | 0.011 | 4 | - | 0.100 | 0.641 | pass (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | bass-ink | tapped | 0.343 | 0.114 | 2 | - | 0.100 | - | unavailable (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | cubes | tapped | 0.899 | 0.022 | 4 | - | 0.100 | 0.897 | pass (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | dancing-character | tapped | 0.338 | 0.075 | 2 | - | 0.100 | 1.000 | unavailable (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | trio-color-wave | tapped | 0.882 | 0.014 | 4 | - | 0.100 | 0.852 | pass (advisory) |
| live.falseFire.share | no-kick-124.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | no-kick-124.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | pad-lead-groove-110.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | summer2000.wav | bass-ink | tapped | 1.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | summer2000.wav | cubes | tapped | 0.667 | 0.098 | 4 | - | 0.100 | 0.957 | pass (advisory) |
| live.falseFire.share | summer2000.wav | dancing-character | tapped | 1.000 | 0.000 | 4 | - | 0.100 | 0.964 | pass (advisory) |
| live.falseFire.share | summer2000.wav | trio-color-wave | tapped | 0.765 | 0.063 | 4 | - | 0.100 | 0.815 | pass (advisory) |
| live.falseFire.share | syncopation-no-kick.wav | cubes | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | syncopation-no-kick.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | syncopationbass.wav | bass-ink | tapped | 0.575 | 0.130 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | syncopationbass.wav | cubes | tapped | 0.791 | 0.049 | 4 | - | 0.100 | 0.804 | pass (advisory) |
| live.falseFire.share | syncopationbass.wav | dancing-character | tapped | 0.744 | 0.219 | 4 | - | 0.100 | 0.895 | pass (advisory) |
| live.falseFire.share | syncopationbass.wav | trio-color-wave | tapped | 0.815 | 0.031 | 4 | - | 0.100 | 0.783 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | bass-ink | tapped | 0.389 | 0.072 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | cubes | tapped | 0.373 | 0.071 | 4 | - | 0.100 | 0.403 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | dancing-character | tapped | 0.400 | 0.223 | 4 | - | 0.100 | 0.438 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | trio-color-wave | tapped | 0.945 | 0.040 | 4 | - | 0.100 | 0.935 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | bass-ink | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | cubes | synthetic | 0.497 | 0.018 | 4 | - | 0.100 | 0.506 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | dancing-character | synthetic | 0.029 | 0.029 | 4 | - | 0.100 | 0.017 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | trio-color-wave | synthetic | 0.494 | 0.000 | 4 | - | 0.100 | 0.494 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | bass-ink | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | cubes | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | dancing-character | synthetic | 0.008 | 0.018 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | trio-color-wave | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | bass-ink | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | cubes | synthetic | 0.659 | 0.017 | 4 | - | 0.100 | 0.667 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | dancing-character | synthetic | 0.000 | 0.024 | 4 | - | 0.100 | 0.029 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | trio-color-wave | synthetic | 0.603 | 0.000 | 4 | - | 0.100 | 0.603 | pass (advisory) |
| live.gate.secondsAfterLock | 6-8-time.wav | dancing-character | tapped | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | bassline-kick-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | unavailable (advisory) |
| live.gate.secondsAfterLock | beatless.wav | dancing-character | beatless | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | click-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | click-140.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | click-174.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | click-90.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | drifting-tempo.wav | dancing-character | drifting | 2.50 | 0.90 | 4 | 4.00 | 2.00 | 4.60 | pass (advisory) |
| live.gate.secondsAfterLock | drums-100.wav | dancing-character | synthetic | 3.23 | 1.27 | 4 | 4.00 | 2.00 | 4.86 | pass (advisory) |
| live.gate.secondsAfterLock | drums-128.wav | dancing-character | synthetic | 2.75 | 1.13 | 4 | 4.00 | 2.00 | 3.89 | pass (advisory) |
| live.gate.secondsAfterLock | drums-150.wav | dancing-character | synthetic | 3.12 | 4.24 | 4 | 4.00 | 2.00 | 4.52 | fail (advisory) |
| live.gate.secondsAfterLock | half-time-shuffle.wav | dancing-character | tapped | 10.36 | 0.20 | 4 | 4.00 | 2.00 | 10.74 | fail (advisory) |
| live.gate.secondsAfterLock | high-bpm-dnb.wav | dancing-character | tapped | 2.52 | 0.00 | 1 | 4.00 | 2.00 | - | fail (advisory) |
| live.gate.secondsAfterLock | imyourgirl.wav | dancing-character | tapped | 2.50 | 1.98 | 4 | 4.00 | 2.00 | 4.54 | pass (advisory) |
| live.gate.secondsAfterLock | lonley.wav | dancing-character | tapped | 5.30 | 0.45 | 4 | 4.00 | 2.00 | 5.62 | fail (advisory) |
| live.gate.secondsAfterLock | low-bpm-rnb.wav | dancing-character | tapped | 16.75 | 3.36 | 3 | 4.00 | 2.00 | 20.21 | fail (advisory) |
| live.gate.secondsAfterLock | no-kick-124.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | summer2000.wav | dancing-character | tapped | 6.44 | 5.11 | 4 | 4.00 | 2.00 | 7.67 | fail (advisory) |
| live.gate.secondsAfterLock | syncopation-no-kick.wav | dancing-character | tapped | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | syncopationbass.wav | dancing-character | tapped | 1.54 | 3.30 | 4 | 4.00 | 2.00 | 15.03 | pass (advisory) |
| live.gate.secondsAfterLock | syncopationbass2.wav | dancing-character | tapped | 3.57 | 2.28 | 4 | 4.00 | 2.00 | 4.06 | pass (advisory) |
| live.gate.secondsAfterLock | trap-2to1-double-90.wav | dancing-character | synthetic | 3.49 | 0.51 | 4 | 4.00 | 2.00 | 5.85 | pass (advisory) |
| live.gate.secondsAfterLock | trap-2to1-half-140.wav | dancing-character | synthetic | 1.93 | 1.64 | 4 | 4.00 | 2.00 | 5.03 | pass (advisory) |
| live.gate.secondsAfterLock | trap-4to3-120.wav | dancing-character | synthetic | 0.69 | 0.03 | 4 | 4.00 | 2.00 | 4.32 | pass (advisory) |
| live.hit.share50ms | 6-8-time.wav | cubes | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | 6-8-time.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | bassline-kick-120.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | unavailable (advisory) |
| live.hit.share50ms | bassline-kick-120.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | unavailable (advisory) |
| live.hit.share50ms | beatless.wav | cubes | beatless | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | beatless.wav | dancing-character | beatless | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-120.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-120.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-120.wav | trio-color-wave | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-140.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-140.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-174.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-174.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-90.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | click-90.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | drifting-tempo.wav | bass-ink | drifting | 0.500 | 0.161 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | drifting-tempo.wav | cubes | drifting | 0.098 | 0.054 | 4 | - | 0.900 | 0.080 | pass (advisory) |
| live.hit.share50ms | drifting-tempo.wav | dancing-character | drifting | 0.321 | 0.179 | 4 | - | 0.900 | 0.286 | pass (advisory) |
| live.hit.share50ms | drifting-tempo.wav | trio-color-wave | drifting | 0.366 | 0.107 | 4 | - | 0.900 | 0.366 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | bass-ink | synthetic | 0.796 | 0.000 | 3 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | drums-100.wav | cubes | synthetic | 0.255 | 0.010 | 4 | - | 0.900 | 0.255 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | dancing-character | synthetic | 0.815 | 0.072 | 4 | - | 0.900 | 0.000 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | trio-color-wave | synthetic | 0.265 | 0.000 | 4 | - | 0.900 | 0.265 | pass (advisory) |
| live.hit.share50ms | drums-128.wav | bass-ink | synthetic | 0.810 | 0.032 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | drums-128.wav | cubes | synthetic | 0.262 | 0.008 | 4 | - | 0.900 | 0.270 | pass (advisory) |
| live.hit.share50ms | drums-128.wav | dancing-character | synthetic | 0.798 | 0.139 | 4 | - | 0.900 | 0.760 | pass (advisory) |
| live.hit.share50ms | drums-128.wav | trio-color-wave | synthetic | 0.270 | 0.000 | 4 | - | 0.900 | 0.270 | pass (advisory) |
| live.hit.share50ms | drums-150.wav | bass-ink | synthetic | - | 0.000 | 0 | - | 0.900 | - | unavailable (advisory) |
| live.hit.share50ms | drums-150.wav | cubes | synthetic | 0.465 | 0.028 | 4 | - | 0.900 | 0.472 | pass (advisory) |
| live.hit.share50ms | drums-150.wav | dancing-character | synthetic | 0.770 | 0.196 | 4 | - | 0.900 | 0.757 | pass (advisory) |
| live.hit.share50ms | drums-150.wav | trio-color-wave | synthetic | 0.260 | 0.000 | 4 | - | 0.900 | 0.260 | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | bass-ink | tapped | 0.189 | 0.081 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | cubes | tapped | 0.338 | 0.054 | 4 | - | 0.900 | 0.365 | fail (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | dancing-character | tapped | 0.135 | 0.081 | 4 | - | 0.900 | 0.135 | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | trio-color-wave | tapped | 0.405 | 0.081 | 4 | - | 0.900 | 0.405 | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | bass-ink | tapped | 0.024 | 0.000 | 3 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | cubes | tapped | 0.024 | 0.012 | 4 | - | 0.900 | 0.012 | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | dancing-character | tapped | 0.083 | 0.000 | 1 | - | 0.900 | - | unavailable (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | trio-color-wave | tapped | 0.041 | 0.024 | 4 | - | 0.900 | 0.035 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | bass-ink | tapped | 0.520 | 0.079 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | cubes | tapped | 0.632 | 0.066 | 4 | - | 0.900 | 0.618 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | dancing-character | tapped | 0.442 | 0.059 | 4 | - | 0.900 | 0.428 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | trio-color-wave | tapped | 0.809 | 0.079 | 4 | - | 0.900 | 0.809 | pass (advisory) |
| live.hit.share50ms | lonley.wav | bass-ink | tapped | 0.000 | 0.000 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | lonley.wav | cubes | tapped | 0.169 | 0.031 | 4 | - | 0.900 | 0.114 | pass (advisory) |
| live.hit.share50ms | lonley.wav | dancing-character | tapped | 0.000 | 0.000 | 4 | - | 0.900 | 0.293 | fail (advisory) |
| live.hit.share50ms | lonley.wav | trio-color-wave | tapped | 0.154 | 0.000 | 4 | - | 0.900 | 0.171 | fail (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | bass-ink | tapped | 0.229 | 0.114 | 2 | - | 0.900 | - | unavailable (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | cubes | tapped | 0.157 | 0.029 | 4 | - | 0.900 | 0.157 | pass (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | dancing-character | tapped | 0.171 | 0.057 | 2 | - | 0.900 | 0.000 | unavailable (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | trio-color-wave | tapped | 0.157 | 0.029 | 4 | - | 0.900 | 0.200 | fail (advisory) |
| live.hit.share50ms | no-kick-124.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | no-kick-124.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | pad-lead-groove-110.wav | cubes | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | summer2000.wav | bass-ink | tapped | 0.000 | 0.000 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | summer2000.wav | cubes | tapped | 0.269 | 0.056 | 4 | - | 0.900 | 0.034 | pass (advisory) |
| live.hit.share50ms | summer2000.wav | dancing-character | tapped | 0.000 | 0.000 | 4 | - | 0.900 | 0.017 | fail (advisory) |
| live.hit.share50ms | summer2000.wav | trio-color-wave | tapped | 0.148 | 0.037 | 4 | - | 0.900 | 0.119 | pass (advisory) |
| live.hit.share50ms | syncopation-no-kick.wav | cubes | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | syncopation-no-kick.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | syncopationbass.wav | bass-ink | tapped | 0.170 | 0.089 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | syncopationbass.wav | cubes | tapped | 0.161 | 0.036 | 4 | - | 0.900 | 0.161 | pass (advisory) |
| live.hit.share50ms | syncopationbass.wav | dancing-character | tapped | 0.189 | 0.185 | 4 | - | 0.900 | 0.036 | pass (advisory) |
| live.hit.share50ms | syncopationbass.wav | trio-color-wave | tapped | 0.089 | 0.018 | 4 | - | 0.900 | 0.107 | fail (advisory) |
| live.hit.share50ms | syncopationbass2.wav | bass-ink | tapped | 0.508 | 0.081 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | cubes | tapped | 0.648 | 0.055 | 4 | - | 0.900 | 0.629 | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | dancing-character | tapped | 0.483 | 0.199 | 4 | - | 0.900 | 0.431 | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | trio-color-wave | tapped | 0.032 | 0.032 | 4 | - | 0.900 | 0.032 | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | bass-ink | synthetic | 0.795 | 0.000 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | cubes | synthetic | 1.000 | 0.000 | 4 | - | 0.900 | 1.000 | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | dancing-character | synthetic | 0.800 | 0.019 | 4 | - | 0.900 | 0.702 | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | trio-color-wave | synthetic | 1.000 | 0.000 | 4 | - | 0.900 | 1.000 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | bass-ink | synthetic | 0.884 | 0.000 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | cubes | synthetic | 0.507 | 0.000 | 4 | - | 0.900 | 0.507 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | dancing-character | synthetic | 0.859 | 0.023 | 4 | - | 0.900 | 0.742 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | trio-color-wave | synthetic | 0.507 | 0.000 | 4 | - | 0.900 | 0.507 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | bass-ink | synthetic | 0.712 | 0.000 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | cubes | synthetic | 0.491 | 0.000 | 4 | - | 0.900 | 0.491 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | dancing-character | synthetic | 0.719 | 0.054 | 4 | - | 0.900 | 0.569 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | trio-color-wave | synthetic | 0.492 | 0.000 | 4 | - | 0.900 | 0.492 | pass (advisory) |
| live.lock.spreadSeconds | 6-8-time.wav | dancing-character | tapped | 0.01 | 0.03 | 4 | 2.00 | - | 0.05 | pass (advisory) |
| live.lock.spreadSeconds | bassline-kick-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | beatless.wav | dancing-character | beatless | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | click-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | click-140.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | click-174.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | click-90.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | drifting-tempo.wav | dancing-character | drifting | 0.00 | 5.12 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | drums-100.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | drums-128.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | drums-150.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | half-time-shuffle.wav | dancing-character | tapped | 0.01 | 0.21 | 4 | 2.00 | - | 0.00 | pass (advisory) |
| live.lock.spreadSeconds | high-bpm-dnb.wav | dancing-character | tapped | 0.16 | 5.11 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | imyourgirl.wav | dancing-character | tapped | 0.05 | 0.25 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | lonley.wav | dancing-character | tapped | 0.04 | 0.15 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | low-bpm-rnb.wav | dancing-character | tapped | 0.05 | 5.05 | 4 | 2.00 | - | 0.04 | pass (advisory) |
| live.lock.spreadSeconds | no-kick-124.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | summer2000.wav | dancing-character | tapped | 0.05 | 0.06 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | syncopation-no-kick.wav | dancing-character | tapped | 0.08 | 4.99 | 4 | 2.00 | - | 0.06 | pass (advisory) |
| live.lock.spreadSeconds | syncopationbass.wav | dancing-character | tapped | 0.19 | 5.14 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | syncopationbass2.wav | dancing-character | tapped | 0.02 | 0.07 | 4 | 2.00 | - | 0.00 | pass (advisory) |
| live.lock.spreadSeconds | trap-2to1-double-90.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | trap-2to1-half-140.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | trap-4to3-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.reaction.latencyMs | 6-8-time.wav | cubes | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | 6-8-time.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | bassline-kick-120.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | bassline-kick-120.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | beatless.wav | cubes | beatless | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | beatless.wav | dancing-character | beatless | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-120.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-120.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-120.wav | trio-color-wave | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-140.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-140.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-174.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-174.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-90.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | click-90.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | drifting-tempo.wav | bass-ink | drifting | 9.3 | 13.3 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | drifting-tempo.wav | cubes | drifting | 220.3 | 7.3 | 4 | - | 46.7 | 223.4 | pass (advisory) |
| live.reaction.latencyMs | drifting-tempo.wav | dancing-character | drifting | 9.3 | 7.7 | 4 | - | 46.7 | 15.2 | pass (advisory) |
| live.reaction.latencyMs | drifting-tempo.wav | trio-color-wave | drifting | 83.3 | 11.0 | 4 | - | 46.7 | 87.3 | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | bass-ink | synthetic | 31.0 | 0.0 | 3 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | cubes | synthetic | 20.0 | 0.0 | 4 | - | 46.7 | 22.7 | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | dancing-character | synthetic | 20.0 | 8.0 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | trio-color-wave | synthetic | 9.3 | 10.7 | 4 | - | 46.7 | 10.7 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | bass-ink | synthetic | 35.6 | 4.5 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | cubes | synthetic | 28.5 | 4.0 | 4 | - | 46.7 | 29.3 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | dancing-character | synthetic | 35.3 | 6.9 | 4 | - | 46.7 | 34.5 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | trio-color-wave | synthetic | 15.0 | 3.3 | 4 | - | 46.7 | 14.5 | pass (advisory) |
| live.reaction.latencyMs | drums-150.wav | bass-ink | synthetic | - | 0.0 | 0 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | drums-150.wav | cubes | synthetic | 28.0 | 2.7 | 4 | - | 46.7 | 30.8 | pass (advisory) |
| live.reaction.latencyMs | drums-150.wav | dancing-character | synthetic | 31.0 | 3.0 | 4 | - | 46.7 | 31.0 | pass (advisory) |
| live.reaction.latencyMs | drums-150.wav | trio-color-wave | synthetic | 10.7 | 10.7 | 4 | - | 46.7 | 9.3 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | bass-ink | tapped | 51.0 | 11.3 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | cubes | tapped | 47.3 | 6.7 | 4 | - | 46.7 | 49.4 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | dancing-character | tapped | 68.6 | 3.8 | 4 | - | 46.7 | 75.7 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | trio-color-wave | tapped | 38.7 | 2.7 | 4 | - | 46.7 | 42.7 | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | bass-ink | tapped | 100.3 | 7.7 | 3 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | cubes | tapped | 97.2 | 16.0 | 4 | - | 46.7 | 100.7 | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | dancing-character | tapped | 98.8 | 0.0 | 1 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | trio-color-wave | tapped | 68.3 | 6.5 | 4 | - | 46.7 | 66.5 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | bass-ink | tapped | 49.3 | 3.0 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | cubes | tapped | 49.0 | 2.7 | 4 | - | 46.7 | 49.0 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | dancing-character | tapped | 50.2 | 2.0 | 4 | - | 46.7 | 49.6 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | trio-color-wave | tapped | 27.3 | 8.0 | 4 | - | 46.7 | 25.5 | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | bass-ink | tapped | 238.9 | 2.3 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | cubes | tapped | 55.0 | 10.5 | 4 | - | 46.7 | 70.9 | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | dancing-character | tapped | 249.2 | 10.3 | 4 | - | 46.7 | 53.3 | fail (advisory) |
| live.reaction.latencyMs | lonley.wav | trio-color-wave | tapped | 30.8 | 9.5 | 4 | - | 46.7 | 38.8 | pass (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | bass-ink | tapped | 46.8 | 15.7 | 2 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | cubes | tapped | 28.0 | 13.7 | 4 | - | 46.7 | 33.3 | pass (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | dancing-character | tapped | 40.2 | 7.7 | 2 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | trio-color-wave | tapped | 65.1 | 10.1 | 4 | - | 46.7 | 69.2 | pass (advisory) |
| live.reaction.latencyMs | no-kick-124.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | no-kick-124.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | pad-lead-groove-110.wav | cubes | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | pad-lead-groove-110.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | summer2000.wav | bass-ink | tapped | 249.0 | 0.0 | 2 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | summer2000.wav | cubes | tapped | 47.4 | 10.7 | 4 | - | 46.7 | 144.2 | pass (advisory) |
| live.reaction.latencyMs | summer2000.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | 104.0 | unavailable (advisory) |
| live.reaction.latencyMs | summer2000.wav | trio-color-wave | tapped | 41.4 | 16.0 | 4 | - | 46.7 | 90.5 | pass (advisory) |
| live.reaction.latencyMs | syncopation-no-kick.wav | cubes | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | syncopation-no-kick.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | syncopationbass.wav | bass-ink | tapped | 57.4 | 23.7 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | syncopationbass.wav | cubes | tapped | 77.8 | 10.7 | 4 | - | 46.7 | 69.7 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass.wav | dancing-character | tapped | 81.0 | 13.3 | 4 | - | 46.7 | 89.9 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass.wav | trio-color-wave | tapped | 64.0 | 8.0 | 4 | - | 46.7 | 68.0 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | bass-ink | tapped | 49.2 | 0.4 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | cubes | tapped | 44.9 | 10.1 | 4 | - | 46.7 | 45.0 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | dancing-character | tapped | 49.3 | 11.0 | 4 | - | 46.7 | 49.2 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | trio-color-wave | tapped | 68.3 | 1.2 | 4 | - | 46.7 | 68.2 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | bass-ink | synthetic | 33.3 | 4.7 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | cubes | synthetic | 31.0 | 5.3 | 4 | - | 46.7 | 31.0 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | dancing-character | synthetic | 33.3 | 2.3 | 4 | - | 46.7 | 33.3 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | trio-color-wave | synthetic | 35.7 | 3.0 | 4 | - | 46.7 | 35.8 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | bass-ink | synthetic | 27.3 | 1.9 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | cubes | synthetic | 14.5 | 2.6 | 4 | - | 46.7 | 14.6 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | dancing-character | synthetic | 25.5 | 2.3 | 4 | - | 46.7 | 24.6 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | trio-color-wave | synthetic | 14.5 | 0.9 | 4 | - | 46.7 | 14.3 | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | bass-ink | synthetic | 31.0 | 5.0 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | cubes | synthetic | 28.0 | 3.0 | 4 | - | 46.7 | 29.9 | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | dancing-character | synthetic | 31.0 | 3.0 | 4 | - | 46.7 | 35.5 | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | trio-color-wave | synthetic | 29.0 | 8.5 | 4 | - | 46.7 | 29.0 | pass (advisory) |

## onset

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| onset.f50.bass | 6-8-time.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | bassline-kick-120.wav | synthetic | 0.768 | 0.900 | - | - | fail |
| onset.f50.bass | beatless.wav | beatless | - | 0.900 | - | - | n/a |
| onset.f50.bass | click-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | click-140.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | click-174.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | click-90.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | drifting-tempo.wav | drifting | - | 0.900 | - | - | n/a |
| onset.f50.bass | drums-100.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.bass | drums-128.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.bass | drums-150.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.bass | half-time-shuffle.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | high-bpm-dnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | imyourgirl.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | lonley.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | low-bpm-rnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | no-kick-124.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.bass | pad-lead-groove-110.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | summer2000.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | syncopation-no-kick.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | syncopationbass.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | syncopationbass2.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.bass | trap-2to1-double-90.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | trap-2to1-half-140.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.bass | trap-4to3-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | 6-8-time.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | bassline-kick-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | beatless.wav | beatless | - | 0.900 | - | - | n/a |
| onset.f50.highs | click-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | click-140.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | click-174.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | click-90.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | drifting-tempo.wav | drifting | - | 0.900 | - | - | n/a |
| onset.f50.highs | drums-100.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | drums-128.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | drums-150.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | half-time-shuffle.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | high-bpm-dnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | imyourgirl.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | lonley.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | low-bpm-rnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | no-kick-124.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | pad-lead-groove-110.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | summer2000.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | syncopation-no-kick.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | syncopationbass.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | syncopationbass2.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.highs | trap-2to1-double-90.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.highs | trap-2to1-half-140.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.highs | trap-4to3-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | 6-8-time.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | bassline-kick-120.wav | synthetic | 0.808 | 0.900 | - | - | fail |
| onset.f50.kick | beatless.wav | beatless | - | 0.900 | - | - | n/a |
| onset.f50.kick | click-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | click-140.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | click-174.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | click-90.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | drifting-tempo.wav | drifting | - | 0.900 | - | - | n/a |
| onset.f50.kick | drums-100.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | drums-128.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | drums-150.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | half-time-shuffle.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | high-bpm-dnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | imyourgirl.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | lonley.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | low-bpm-rnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | no-kick-124.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.kick | pad-lead-groove-110.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | summer2000.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | syncopation-no-kick.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | syncopationbass.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | syncopationbass2.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.kick | trap-2to1-double-90.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | trap-2to1-half-140.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.kick | trap-4to3-120.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | 6-8-time.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | bassline-kick-120.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.snare | beatless.wav | beatless | - | 0.900 | - | - | n/a |
| onset.f50.snare | click-120.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | click-140.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | click-174.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | click-90.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | drifting-tempo.wav | drifting | - | 0.900 | - | - | n/a |
| onset.f50.snare | drums-100.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | drums-128.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | drums-150.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | half-time-shuffle.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | high-bpm-dnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | imyourgirl.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | lonley.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | low-bpm-rnb.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | no-kick-124.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | pad-lead-groove-110.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | summer2000.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | syncopation-no-kick.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | syncopationbass.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | syncopationbass2.wav | tapped | - | 0.900 | - | - | n/a |
| onset.f50.snare | trap-2to1-double-90.wav | synthetic | 1.000 | 0.900 | - | - | pass |
| onset.f50.snare | trap-2to1-half-140.wav | synthetic | - | 0.900 | - | - | n/a |
| onset.f50.snare | trap-4to3-120.wav | synthetic | 1.000 | 0.900 | - | - | pass |

## setDirector

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| setDirector.transitionSeconds.01 | 6-8-time.wav | tapped | 17.533 | - | - | - | pass (report-only) |
| setDirector.transitionSeconds.01 | lonley.wav | tapped | 10.783 | - | - | - | pass (report-only) |
| setDirector.transitionSeconds.01 | summer2000.wav | tapped | 23.567 | - | - | - | pass (report-only) |
| setDirector.transitionSeconds.01 | syncopationbass.wav | tapped | 21.733 | - | - | - | pass (report-only) |
| setDirector.transitionSeconds.02 | syncopationbass.wav | tapped | 31.200 | - | - | - | pass (report-only) |
| setDirector.transitions | 6-8-time.wav | tapped | 1.000 | - | - | - | pass (report-only) |
| setDirector.transitions | beatless.wav | beatless | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | drifting-tempo.wav | drifting | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | half-time-shuffle.wav | tapped | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | high-bpm-dnb.wav | tapped | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | imyourgirl.wav | tapped | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | lonley.wav | tapped | 1.000 | - | - | - | pass (report-only) |
| setDirector.transitions | low-bpm-rnb.wav | tapped | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | summer2000.wav | tapped | 1.000 | - | - | - | pass (report-only) |
| setDirector.transitions | syncopation-no-kick.wav | tapped | 0.000 | - | - | - | pass (report-only) |
| setDirector.transitions | syncopationbass.wav | tapped | 2.000 | - | - | - | pass (report-only) |
| setDirector.transitions | syncopationbass2.wav | tapped | 0.000 | - | - | - | pass (report-only) |

## tempo

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| tempo.beatlessNeverLocks | 6-8-time.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | bassline-kick-120.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | beatless.wav | beatless | 1 | 0 | - | - | fail |
| tempo.beatlessNeverLocks | click-120.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | click-140.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | click-174.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | click-90.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | drifting-tempo.wav | drifting | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | drums-100.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | drums-128.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | drums-150.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | half-time-shuffle.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | high-bpm-dnb.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | imyourgirl.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | lonley.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | low-bpm-rnb.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | no-kick-124.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | pad-lead-groove-110.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | summer2000.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | syncopation-no-kick.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | syncopationbass.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | syncopationbass2.wav | tapped | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | trap-2to1-double-90.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | trap-2to1-half-140.wav | synthetic | - | 0 | - | - | n/a |
| tempo.beatlessNeverLocks | trap-4to3-120.wav | synthetic | - | 0 | - | - | n/a |
| tempo.falseSongChanges | 6-8-time.wav | tapped | 1 | 0 | - | - | fail |
| tempo.falseSongChanges | bassline-kick-120.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | beatless.wav | beatless | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | click-120.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | click-140.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | click-174.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | click-90.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | drifting-tempo.wav | drifting | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | drums-100.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | drums-128.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | drums-150.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | half-time-shuffle.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | high-bpm-dnb.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | imyourgirl.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | lonley.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | low-bpm-rnb.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | no-kick-124.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | pad-lead-groove-110.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | summer2000.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | syncopation-no-kick.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | syncopationbass.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | syncopationbass2.wav | tapped | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | trap-2to1-double-90.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | trap-2to1-half-140.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.falseSongChanges | trap-4to3-120.wav | synthetic | 0 | 0 | - | - | pass |
| tempo.lockSeconds | 6-8-time.wav | tapped | - | - | - | - | pass (report-only) |
| tempo.lockSeconds | bassline-kick-120.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | beatless.wav | beatless | - | - | - | - | n/a |
| tempo.lockSeconds | click-120.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | click-140.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | click-174.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | click-90.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | drifting-tempo.wav | drifting | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | drums-100.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | drums-128.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | drums-150.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | half-time-shuffle.wav | tapped | 20.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | high-bpm-dnb.wav | tapped | 8.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | imyourgirl.wav | tapped | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | lonley.wav | tapped | 8.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | low-bpm-rnb.wav | tapped | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | no-kick-124.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | pad-lead-groove-110.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | summer2000.wav | tapped | 8.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | syncopation-no-kick.wav | tapped | 8.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | syncopationbass.wav | tapped | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | syncopationbass2.wav | tapped | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | trap-2to1-double-90.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | trap-2to1-half-140.wav | synthetic | 3.02 | - | - | - | pass (report-only) |
| tempo.lockSeconds | trap-4to3-120.wav | synthetic | 8.02 | - | - | - | pass (report-only) |
| tempo.maxErrorAfterLock | 6-8-time.wav | tapped | - | 0.020 | - | - | fail |
| tempo.maxErrorAfterLock | bassline-kick-120.wav | synthetic | 0.000 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | beatless.wav | beatless | - | 0.020 | - | - | n/a |
| tempo.maxErrorAfterLock | click-120.wav | synthetic | 0.000 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | click-140.wav | synthetic | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | click-174.wav | synthetic | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | click-90.wav | synthetic | 0.002 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | drifting-tempo.wav | drifting | 0.017 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | drums-100.wav | synthetic | 0.000 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | drums-128.wav | synthetic | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | drums-150.wav | synthetic | 0.000 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | half-time-shuffle.wav | tapped | 0.019 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | high-bpm-dnb.wav | tapped | 0.000 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | imyourgirl.wav | tapped | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | lonley.wav | tapped | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | low-bpm-rnb.wav | tapped | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | no-kick-124.wav | synthetic | 0.002 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | pad-lead-groove-110.wav | synthetic | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | summer2000.wav | tapped | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | syncopation-no-kick.wav | tapped | 0.001 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | syncopationbass.wav | tapped | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | syncopationbass2.wav | tapped | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | trap-2to1-double-90.wav | synthetic | 0.002 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | trap-2to1-half-140.wav | synthetic | 0.003 | 0.020 | - | - | pass |
| tempo.maxErrorAfterLock | trap-4to3-120.wav | synthetic | 0.000 | 0.020 | - | - | pass |
