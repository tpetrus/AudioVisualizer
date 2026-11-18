# Scorecard

Targets version 7, revision f8097a0, created 2026-11-18T23:11:08.846Z.

Pre-hub is the same metric with the gate fed the pre-hub input; where it is blank the rhythm DSP is unchanged since the commit before the hub merge, so the pre-hub value equals the value shown.

Applicable cells 202: 174 passing, 28 failing, 0 unavailable. Blocking failures: 28.

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
| beat.errorMedianMs | lonley.wav | tapped | 33.3 | 40.0 | - | - | pass |
| beat.errorMedianMs | low-bpm-rnb.wav | tapped | 169.1 | 40.0 | - | - | fail |
| beat.errorMedianMs | no-kick-124.wav | synthetic | 1.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | pad-lead-groove-110.wav | synthetic | 1.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | summer2000.wav | tapped | 129.3 | 40.0 | - | - | fail |
| beat.errorMedianMs | syncopation-no-kick.wav | tapped | 29.9 | 40.0 | - | - | pass |
| beat.errorMedianMs | syncopationbass.wav | tapped | 53.5 | 40.0 | - | - | fail |
| beat.errorMedianMs | syncopationbass2.wav | tapped | 18.7 | 40.0 | - | - | pass |
| beat.errorMedianMs | trap-2to1-double-90.wav | synthetic | 2.3 | 20.0 | - | - | pass |
| beat.errorMedianMs | trap-2to1-half-140.wav | synthetic | 3.6 | 20.0 | - | - | pass |
| beat.errorMedianMs | trap-4to3-120.wav | synthetic | 1.6 | 20.0 | - | - | pass |

## cubes

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| cubes.hit.share50ms | 6-8-time.wav | tapped | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | bassline-kick-120.wav | synthetic | 0.508 | - | 0.900 | 0.780 | fail |
| cubes.hit.share50ms | beatless.wav | beatless | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-120.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-140.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-174.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | click-90.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | drifting-tempo.wav | drifting | 0.161 | - | 0.900 | 0.125 | pass |
| cubes.hit.share50ms | drums-100.wav | synthetic | 0.265 | - | 0.900 | 0.265 | pass |
| cubes.hit.share50ms | drums-128.wav | synthetic | 0.286 | - | 0.900 | 0.270 | pass |
| cubes.hit.share50ms | drums-150.wav | synthetic | 0.507 | - | 0.900 | 0.479 | pass |
| cubes.hit.share50ms | half-time-shuffle.wav | tapped | 0.351 | - | 0.900 | 0.378 | pass |
| cubes.hit.share50ms | high-bpm-dnb.wav | tapped | 0.000 | - | 0.900 | 0.000 | pass |
| cubes.hit.share50ms | imyourgirl.wav | tapped | 0.605 | - | 0.900 | 0.553 | pass |
| cubes.hit.share50ms | lonley.wav | tapped | 0.100 | - | 0.900 | 0.086 | pass |
| cubes.hit.share50ms | low-bpm-rnb.wav | tapped | 0.143 | - | 0.900 | 0.171 | pass |
| cubes.hit.share50ms | no-kick-124.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | pad-lead-groove-110.wav | synthetic | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | summer2000.wav | tapped | 0.034 | - | 0.900 | 0.034 | pass |
| cubes.hit.share50ms | syncopation-no-kick.wav | tapped | - | - | 0.900 | - | n/a |
| cubes.hit.share50ms | syncopationbass.wav | tapped | 0.196 | - | 0.900 | 0.179 | pass |
| cubes.hit.share50ms | syncopationbass2.wav | tapped | 0.677 | - | 0.900 | 0.629 | pass |
| cubes.hit.share50ms | trap-2to1-double-90.wav | synthetic | 1.000 | - | 0.900 | 1.000 | pass |
| cubes.hit.share50ms | trap-2to1-half-140.wav | synthetic | 0.507 | - | 0.900 | 0.507 | pass |
| cubes.hit.share50ms | trap-4to3-120.wav | synthetic | 0.492 | - | 0.900 | 0.492 | pass |
| cubes.reaction.latencyMs | 6-8-time.wav | tapped | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | bassline-kick-120.wav | synthetic | 50.0 | - | 46.7 | 33.3 | pass |
| cubes.reaction.latencyMs | beatless.wav | beatless | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-120.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-140.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-174.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | click-90.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | drifting-tempo.wav | drifting | 222.7 | - | 46.7 | 224.0 | pass |
| cubes.reaction.latencyMs | drums-100.wav | synthetic | 16.7 | - | 46.7 | 16.7 | pass |
| cubes.reaction.latencyMs | drums-128.wav | synthetic | 29.2 | - | 46.7 | 29.2 | pass |
| cubes.reaction.latencyMs | drums-150.wav | synthetic | 33.3 | - | 46.7 | 33.3 | pass |
| cubes.reaction.latencyMs | half-time-shuffle.wav | tapped | 43.7 | - | 46.7 | 40.7 | pass |
| cubes.reaction.latencyMs | high-bpm-dnb.wav | tapped | 102.7 | - | 46.7 | 104.7 | pass |
| cubes.reaction.latencyMs | imyourgirl.wav | tapped | 43.3 | - | 46.7 | 46.7 | pass |
| cubes.reaction.latencyMs | lonley.wav | tapped | 66.7 | - | 46.7 | 83.3 | pass |
| cubes.reaction.latencyMs | low-bpm-rnb.wav | tapped | 28.0 | - | 46.7 | 16.7 | pass |
| cubes.reaction.latencyMs | no-kick-124.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | pad-lead-groove-110.wav | synthetic | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | summer2000.wav | tapped | 122.0 | - | 46.7 | 119.3 | pass |
| cubes.reaction.latencyMs | syncopation-no-kick.wav | tapped | - | - | 46.7 | - | n/a |
| cubes.reaction.latencyMs | syncopationbass.wav | tapped | 73.3 | - | 46.7 | 74.7 | pass |
| cubes.reaction.latencyMs | syncopationbass2.wav | tapped | 43.0 | - | 46.7 | 46.0 | pass |
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
| gate.firstOpenSeconds | bassline-kick-120.wav | synthetic | 7.53 | - | - | 8.55 | pass (report-only) |
| gate.firstOpenSeconds | beatless.wav | beatless | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-120.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-140.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-174.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-90.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | drifting-tempo.wav | drifting | 8.68 | - | - | 8.68 | pass (report-only) |
| gate.firstOpenSeconds | drums-100.wav | synthetic | 8.07 | - | - | 8.07 | pass (report-only) |
| gate.firstOpenSeconds | drums-128.wav | synthetic | 7.08 | - | - | 7.08 | pass (report-only) |
| gate.firstOpenSeconds | drums-150.wav | synthetic | 7.73 | - | - | 7.73 | pass (report-only) |
| gate.firstOpenSeconds | half-time-shuffle.wav | tapped | 18.95 | - | - | 18.95 | pass (report-only) |
| gate.firstOpenSeconds | high-bpm-dnb.wav | tapped | - | - | - | - | pass (report-only) |
| gate.firstOpenSeconds | imyourgirl.wav | tapped | 7.73 | - | - | 7.73 | pass (report-only) |
| gate.firstOpenSeconds | lonley.wav | tapped | 19.60 | - | - | 19.62 | pass (report-only) |
| gate.firstOpenSeconds | low-bpm-rnb.wav | tapped | - | - | - | - | pass (report-only) |
| gate.firstOpenSeconds | no-kick-124.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | pad-lead-groove-110.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | summer2000.wav | tapped | 15.65 | - | - | 15.17 | pass (report-only) |
| gate.firstOpenSeconds | syncopation-no-kick.wav | tapped | - | - | - | - | n/a |
| gate.firstOpenSeconds | syncopationbass.wav | tapped | 21.28 | - | - | 21.30 | pass (report-only) |
| gate.firstOpenSeconds | syncopationbass2.wav | tapped | 7.27 | - | - | 7.27 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-double-90.wav | synthetic | 8.87 | - | - | 8.87 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-half-140.wav | synthetic | 8.23 | - | - | 8.23 | pass (report-only) |
| gate.firstOpenSeconds | trap-4to3-120.wav | synthetic | 12.53 | - | - | 12.52 | pass (report-only) |
| gate.secondsAfterLock | 6-8-time.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | bassline-kick-120.wav | synthetic | 4.40 | 4.00 | 2.00 | 5.42 | fail |
| gate.secondsAfterLock | beatless.wav | beatless | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-120.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-140.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-174.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-90.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | drifting-tempo.wav | drifting | 5.52 | 4.00 | 2.00 | 5.52 | fail |
| gate.secondsAfterLock | drums-100.wav | synthetic | 4.93 | 4.00 | 2.00 | 4.93 | fail |
| gate.secondsAfterLock | drums-128.wav | synthetic | 3.95 | 4.00 | 2.00 | 3.95 | pass |
| gate.secondsAfterLock | drums-150.wav | synthetic | 4.60 | 4.00 | 2.00 | 4.60 | fail |
| gate.secondsAfterLock | half-time-shuffle.wav | tapped | 7.55 | 4.00 | 2.00 | 7.55 | fail |
| gate.secondsAfterLock | high-bpm-dnb.wav | tapped | - | 4.00 | 2.00 | - | fail |
| gate.secondsAfterLock | imyourgirl.wav | tapped | 4.60 | 4.00 | 2.00 | 4.60 | fail |
| gate.secondsAfterLock | lonley.wav | tapped | 11.47 | 4.00 | 2.00 | 11.48 | fail |
| gate.secondsAfterLock | low-bpm-rnb.wav | tapped | - | 4.00 | 2.00 | - | fail |
| gate.secondsAfterLock | no-kick-124.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | pad-lead-groove-110.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | summer2000.wav | tapped | 7.52 | 4.00 | 2.00 | 7.03 | fail |
| gate.secondsAfterLock | syncopation-no-kick.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | syncopationbass.wav | tapped | 18.15 | 4.00 | 2.00 | 18.17 | fail |
| gate.secondsAfterLock | syncopationbass2.wav | tapped | 4.13 | 4.00 | 2.00 | 4.13 | fail |
| gate.secondsAfterLock | trap-2to1-double-90.wav | synthetic | 5.73 | 4.00 | 2.00 | 5.73 | fail |
| gate.secondsAfterLock | trap-2to1-half-140.wav | synthetic | 5.05 | 4.00 | 2.00 | 5.05 | fail |
| gate.secondsAfterLock | trap-4to3-120.wav | synthetic | 4.40 | 4.00 | 2.00 | 4.38 | fail |

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
| onset.f50.bass | no-kick-124.wav | synthetic | 0.674 | 0.900 | - | - | fail |
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
| onset.f50.kick | bassline-kick-120.wav | synthetic | 0.682 | 0.900 | - | - | fail |
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
| tempo.maxErrorAfterLock | drifting-tempo.wav | drifting | 0.028 | 0.020 | - | - | fail |
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
