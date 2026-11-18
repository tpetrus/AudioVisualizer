# Scorecard

Targets version 6, revision 51812bf, created 2026-11-18T13:45:31.140Z.

Pre-hub is the same metric with the gate fed the pre-hub input; where it is blank the rhythm DSP is unchanged since the commit before the hub merge, so the pre-hub value equals the value shown.

Applicable cells 342: 282 passing, 56 failing, 4 unavailable. Blocking failures: 28.

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

## gate

| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|
| gate.closedOnNoKick | 6-8-time.wav | tapped | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | bassline-kick-120.wav | synthetic | - | - | - | - | n/a |
| gate.closedOnNoKick | beatless.wav | beatless | - | - | - | - | n/a |
| gate.closedOnNoKick | click-120.wav | synthetic | 1 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | click-140.wav | synthetic | 0 | - | - | - | pass (report-only) |
| gate.closedOnNoKick | click-174.wav | synthetic | 1 | - | - | - | pass (report-only) |
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
| gate.firstOpenSeconds | bassline-kick-120.wav | synthetic | 7.83 | - | - | 8.55 | pass (report-only) |
| gate.firstOpenSeconds | beatless.wav | beatless | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-120.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-140.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-174.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | click-90.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | drifting-tempo.wav | drifting | 9.23 | - | - | 8.68 | pass (report-only) |
| gate.firstOpenSeconds | drums-100.wav | synthetic | 8.05 | - | - | 8.07 | pass (report-only) |
| gate.firstOpenSeconds | drums-128.wav | synthetic | 7.33 | - | - | 7.08 | pass (report-only) |
| gate.firstOpenSeconds | drums-150.wav | synthetic | 7.70 | - | - | 7.73 | pass (report-only) |
| gate.firstOpenSeconds | half-time-shuffle.wav | tapped | 19.68 | - | - | 18.95 | pass (report-only) |
| gate.firstOpenSeconds | high-bpm-dnb.wav | tapped | 18.23 | - | - | - | pass (report-only) |
| gate.firstOpenSeconds | imyourgirl.wav | tapped | 7.28 | - | - | 7.73 | pass (report-only) |
| gate.firstOpenSeconds | lonley.wav | tapped | 25.18 | - | - | 19.62 | pass (report-only) |
| gate.firstOpenSeconds | low-bpm-rnb.wav | tapped | - | - | - | - | pass (report-only) |
| gate.firstOpenSeconds | no-kick-124.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | pad-lead-groove-110.wav | synthetic | - | - | - | - | n/a |
| gate.firstOpenSeconds | summer2000.wav | tapped | - | - | - | 15.17 | pass (report-only) |
| gate.firstOpenSeconds | syncopation-no-kick.wav | tapped | - | - | - | - | n/a |
| gate.firstOpenSeconds | syncopationbass.wav | tapped | 17.23 | - | - | 21.30 | pass (report-only) |
| gate.firstOpenSeconds | syncopationbass2.wav | tapped | 12.40 | - | - | 7.27 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-double-90.wav | synthetic | 8.85 | - | - | 8.87 | pass (report-only) |
| gate.firstOpenSeconds | trap-2to1-half-140.wav | synthetic | 8.23 | - | - | 8.23 | pass (report-only) |
| gate.firstOpenSeconds | trap-4to3-120.wav | synthetic | 12.50 | - | - | 12.52 | pass (report-only) |
| gate.secondsAfterLock | 6-8-time.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | bassline-kick-120.wav | synthetic | 4.70 | 4.00 | 2.00 | 5.42 | fail |
| gate.secondsAfterLock | beatless.wav | beatless | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-120.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-140.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-174.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | click-90.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | drifting-tempo.wav | drifting | 6.07 | 4.00 | 2.00 | 5.52 | fail |
| gate.secondsAfterLock | drums-100.wav | synthetic | 4.92 | 4.00 | 2.00 | 4.93 | fail |
| gate.secondsAfterLock | drums-128.wav | synthetic | 4.20 | 4.00 | 2.00 | 3.95 | fail |
| gate.secondsAfterLock | drums-150.wav | synthetic | 4.57 | 4.00 | 2.00 | 4.60 | fail |
| gate.secondsAfterLock | half-time-shuffle.wav | tapped | 8.28 | 4.00 | 2.00 | 7.55 | fail |
| gate.secondsAfterLock | high-bpm-dnb.wav | tapped | 10.10 | 4.00 | 2.00 | - | fail |
| gate.secondsAfterLock | imyourgirl.wav | tapped | 4.15 | 4.00 | 2.00 | 4.60 | fail |
| gate.secondsAfterLock | lonley.wav | tapped | 17.05 | 4.00 | 2.00 | 11.48 | fail |
| gate.secondsAfterLock | low-bpm-rnb.wav | tapped | - | 4.00 | 2.00 | - | fail |
| gate.secondsAfterLock | no-kick-124.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | pad-lead-groove-110.wav | synthetic | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | summer2000.wav | tapped | - | 4.00 | 2.00 | 7.03 | fail |
| gate.secondsAfterLock | syncopation-no-kick.wav | tapped | - | 4.00 | 2.00 | - | n/a |
| gate.secondsAfterLock | syncopationbass.wav | tapped | 14.10 | 4.00 | 2.00 | 18.17 | fail |
| gate.secondsAfterLock | syncopationbass2.wav | tapped | 9.27 | 4.00 | 2.00 | 4.13 | fail |
| gate.secondsAfterLock | trap-2to1-double-90.wav | synthetic | 5.72 | 4.00 | 2.00 | 5.73 | fail |
| gate.secondsAfterLock | trap-2to1-half-140.wav | synthetic | 5.05 | 4.00 | 2.00 | 5.05 | fail |
| gate.secondsAfterLock | trap-4to3-120.wav | synthetic | 4.37 | 4.00 | 2.00 | 4.38 | fail |

## live

Median over the runs; spread is max minus min; advisory (decision D13).

| Metric | Track | Visualizer | Class | Median | Spread | Runs | Floor | Stretch | Pre-hub | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| live.clip.maxDeviationLoops | 6-8-time.wav | dancing-character | tapped | 0.386 | 0.151 | 4 | 0.050 | - | 0.242 | fail (advisory) |
| live.clip.maxDeviationLoops | drifting-tempo.wav | dancing-character | drifting | 0.059 | 0.497 | 4 | 0.050 | - | 0.060 | fail (advisory) |
| live.clip.maxDeviationLoops | drums-100.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.clip.maxDeviationLoops | drums-128.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.clip.maxDeviationLoops | drums-150.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.clip.maxDeviationLoops | half-time-shuffle.wav | dancing-character | tapped | 0.248 | 0.458 | 4 | 0.050 | - | 0.288 | fail (advisory) |
| live.clip.maxDeviationLoops | high-bpm-dnb.wav | dancing-character | tapped | 0.002 | 0.372 | 4 | 0.050 | - | 0.003 | pass (advisory) |
| live.clip.maxDeviationLoops | imyourgirl.wav | dancing-character | tapped | 0.004 | 0.494 | 4 | 0.050 | - | 0.007 | pass (advisory) |
| live.clip.maxDeviationLoops | lonley.wav | dancing-character | tapped | 0.004 | 0.492 | 4 | 0.050 | - | 0.004 | pass (advisory) |
| live.clip.maxDeviationLoops | low-bpm-rnb.wav | dancing-character | tapped | 0.065 | 0.214 | 4 | 0.050 | - | 0.002 | fail (advisory) |
| live.clip.maxDeviationLoops | summer2000.wav | dancing-character | tapped | 0.142 | 0.404 | 4 | 0.050 | - | 0.143 | fail (advisory) |
| live.clip.maxDeviationLoops | syncopation-no-kick.wav | dancing-character | tapped | 0.018 | 0.479 | 4 | 0.050 | - | 0.016 | pass (advisory) |
| live.clip.maxDeviationLoops | syncopationbass.wav | dancing-character | tapped | 0.001 | 0.490 | 4 | 0.050 | - | 0.001 | pass (advisory) |
| live.clip.maxDeviationLoops | syncopationbass2.wav | dancing-character | tapped | 0.011 | 0.485 | 4 | 0.050 | - | 0.007 | pass (advisory) |
| live.clip.maxDeviationLoops | trap-2to1-double-90.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.clip.maxDeviationLoops | trap-2to1-half-140.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.clip.maxDeviationLoops | trap-4to3-120.wav | dancing-character | synthetic | - | 0.000 | 0 | 0.050 | - | - | n/a |
| live.falseFire.share | 6-8-time.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | drifting-tempo.wav | cubes | drifting | 0.969 | 0.059 | 4 | - | 0.100 | 0.882 | pass (advisory) |
| live.falseFire.share | drifting-tempo.wav | dancing-character | drifting | 0.485 | 0.636 | 4 | - | 0.100 | 0.529 | pass (advisory) |
| live.falseFire.share | drifting-tempo.wav | trio-color-wave | drifting | 0.656 | 0.052 | 4 | - | 0.100 | 0.667 | pass (advisory) |
| live.falseFire.share | drums-100.wav | cubes | synthetic | 0.757 | 0.025 | 4 | - | 0.100 | 0.750 | pass (advisory) |
| live.falseFire.share | drums-100.wav | dancing-character | synthetic | 1.000 | 0.000 | 4 | - | 0.100 | 1.000 | pass (advisory) |
| live.falseFire.share | drums-100.wav | trio-color-wave | synthetic | 0.735 | 0.000 | 4 | - | 0.100 | 0.735 | pass (advisory) |
| live.falseFire.share | drums-128.wav | cubes | synthetic | 0.577 | 0.057 | 4 | - | 0.100 | 0.652 | pass (advisory) |
| live.falseFire.share | drums-128.wav | dancing-character | synthetic | 0.085 | 1.000 | 4 | - | 0.100 | 0.042 | pass (advisory) |
| live.falseFire.share | drums-128.wav | trio-color-wave | synthetic | 0.638 | 0.028 | 4 | - | 0.100 | 0.653 | pass (advisory) |
| live.falseFire.share | drums-150.wav | cubes | synthetic | 0.619 | 0.139 | 4 | - | 0.100 | 0.383 | pass (advisory) |
| live.falseFire.share | drums-150.wav | dancing-character | synthetic | 0.685 | 0.981 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | drums-150.wav | trio-color-wave | synthetic | 0.486 | 0.014 | 4 | - | 0.100 | 0.493 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | cubes | tapped | 0.793 | 0.056 | 4 | - | 0.100 | 0.773 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | dancing-character | tapped | 0.788 | 0.123 | 4 | - | 0.100 | 0.792 | pass (advisory) |
| live.falseFire.share | half-time-shuffle.wav | trio-color-wave | tapped | 0.738 | 0.045 | 4 | - | 0.100 | 0.722 | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | cubes | tapped | 0.948 | 0.091 | 4 | - | 0.100 | 0.935 | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | dancing-character | tapped | 0.938 | 0.250 | 4 | - | 0.100 | - | pass (advisory) |
| live.falseFire.share | high-bpm-dnb.wav | trio-color-wave | tapped | 0.830 | 0.095 | 4 | - | 0.100 | 0.850 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | cubes | tapped | 0.336 | 0.124 | 4 | - | 0.100 | 0.478 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | dancing-character | tapped | 0.293 | 0.110 | 4 | - | 0.100 | 0.455 | pass (advisory) |
| live.falseFire.share | imyourgirl.wav | trio-color-wave | tapped | 0.233 | 0.061 | 4 | - | 0.100 | 0.258 | pass (advisory) |
| live.falseFire.share | lonley.wav | cubes | tapped | 0.823 | 0.062 | 4 | - | 0.100 | 0.817 | pass (advisory) |
| live.falseFire.share | lonley.wav | dancing-character | tapped | 0.325 | 0.854 | 4 | - | 0.100 | 0.474 | pass (advisory) |
| live.falseFire.share | lonley.wav | trio-color-wave | tapped | 0.624 | 0.126 | 4 | - | 0.100 | 0.641 | pass (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | cubes | tapped | 0.935 | 0.019 | 4 | - | 0.100 | 0.897 | pass (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | dancing-character | tapped | 1.000 | 1.000 | 4 | - | 0.100 | 1.000 | pass (advisory) |
| live.falseFire.share | low-bpm-rnb.wav | trio-color-wave | tapped | 0.882 | 0.014 | 4 | - | 0.100 | 0.852 | pass (advisory) |
| live.falseFire.share | summer2000.wav | cubes | tapped | 0.818 | 0.083 | 4 | - | 0.100 | 0.957 | pass (advisory) |
| live.falseFire.share | summer2000.wav | dancing-character | tapped | 0.429 | 1.000 | 3 | - | 0.100 | 0.964 | pass (advisory) |
| live.falseFire.share | summer2000.wav | trio-color-wave | tapped | 0.861 | 0.107 | 4 | - | 0.100 | 0.815 | pass (advisory) |
| live.falseFire.share | syncopation-no-kick.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.100 | - | n/a |
| live.falseFire.share | syncopationbass.wav | cubes | tapped | 0.834 | 0.026 | 4 | - | 0.100 | 0.804 | pass (advisory) |
| live.falseFire.share | syncopationbass.wav | dancing-character | tapped | 0.964 | 0.259 | 4 | - | 0.100 | 0.895 | pass (advisory) |
| live.falseFire.share | syncopationbass.wav | trio-color-wave | tapped | 0.815 | 0.031 | 4 | - | 0.100 | 0.783 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | cubes | tapped | 0.374 | 0.110 | 4 | - | 0.100 | 0.403 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | dancing-character | tapped | 0.357 | 0.116 | 4 | - | 0.100 | 0.438 | pass (advisory) |
| live.falseFire.share | syncopationbass2.wav | trio-color-wave | tapped | 0.945 | 0.040 | 4 | - | 0.100 | 0.935 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | cubes | synthetic | 0.551 | 0.045 | 4 | - | 0.100 | 0.506 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | dancing-character | synthetic | 0.017 | 1.000 | 4 | - | 0.100 | 0.017 | pass (advisory) |
| live.falseFire.share | trap-2to1-double-90.wav | trio-color-wave | synthetic | 0.494 | 0.000 | 4 | - | 0.100 | 0.494 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | cubes | synthetic | 0.030 | 0.059 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | dancing-character | synthetic | 0.000 | 0.020 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-2to1-half-140.wav | trio-color-wave | synthetic | 0.000 | 0.000 | 4 | - | 0.100 | 0.000 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | cubes | synthetic | 0.629 | 0.026 | 4 | - | 0.100 | 0.667 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | dancing-character | synthetic | 0.103 | 0.235 | 4 | - | 0.100 | 0.029 | pass (advisory) |
| live.falseFire.share | trap-4to3-120.wav | trio-color-wave | synthetic | 0.603 | 0.000 | 4 | - | 0.100 | 0.603 | pass (advisory) |
| live.gate.secondsAfterLock | 6-8-time.wav | dancing-character | tapped | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | drifting-tempo.wav | dancing-character | drifting | 5.15 | 0.92 | 4 | 4.00 | 2.00 | 4.60 | fail (advisory) |
| live.gate.secondsAfterLock | drums-100.wav | dancing-character | synthetic | 5.37 | 1.20 | 4 | 4.00 | 2.00 | 4.86 | fail (advisory) |
| live.gate.secondsAfterLock | drums-128.wav | dancing-character | synthetic | 3.90 | 0.37 | 4 | 4.00 | 2.00 | 3.89 | pass (advisory) |
| live.gate.secondsAfterLock | drums-150.wav | dancing-character | synthetic | 3.99 | 1.35 | 4 | 4.00 | 2.00 | 4.52 | fail (advisory) |
| live.gate.secondsAfterLock | half-time-shuffle.wav | dancing-character | tapped | 10.74 | 1.68 | 4 | 4.00 | 2.00 | 10.74 | fail (advisory) |
| live.gate.secondsAfterLock | high-bpm-dnb.wav | dancing-character | tapped | 16.23 | 11.32 | 4 | 4.00 | 2.00 | - | fail (advisory) |
| live.gate.secondsAfterLock | imyourgirl.wav | dancing-character | tapped | 4.07 | 0.96 | 4 | 4.00 | 2.00 | 4.54 | fail (advisory) |
| live.gate.secondsAfterLock | lonley.wav | dancing-character | tapped | 5.60 | 2.88 | 4 | 4.00 | 2.00 | 5.62 | fail (advisory) |
| live.gate.secondsAfterLock | low-bpm-rnb.wav | dancing-character | tapped | 20.77 | 10.71 | 3 | 4.00 | 2.00 | 20.21 | fail (advisory) |
| live.gate.secondsAfterLock | summer2000.wav | dancing-character | tapped | 17.39 | 0.83 | 2 | 4.00 | 2.00 | 7.67 | fail (advisory) |
| live.gate.secondsAfterLock | syncopation-no-kick.wav | dancing-character | tapped | - | 0.00 | 0 | 4.00 | 2.00 | - | n/a |
| live.gate.secondsAfterLock | syncopationbass.wav | dancing-character | tapped | 9.29 | 1.68 | 4 | 4.00 | 2.00 | 15.03 | fail (advisory) |
| live.gate.secondsAfterLock | syncopationbass2.wav | dancing-character | tapped | 6.42 | 2.34 | 4 | 4.00 | 2.00 | 4.06 | fail (advisory) |
| live.gate.secondsAfterLock | trap-2to1-double-90.wav | dancing-character | synthetic | 5.85 | 0.16 | 4 | 4.00 | 2.00 | 5.85 | fail (advisory) |
| live.gate.secondsAfterLock | trap-2to1-half-140.wav | dancing-character | synthetic | 5.03 | 0.04 | 4 | 4.00 | 2.00 | 5.03 | fail (advisory) |
| live.gate.secondsAfterLock | trap-4to3-120.wav | dancing-character | synthetic | 4.32 | 0.03 | 4 | 4.00 | 2.00 | 4.32 | fail (advisory) |
| live.hit.share50ms | 6-8-time.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | drifting-tempo.wav | cubes | drifting | 0.018 | 0.036 | 4 | - | 0.900 | 0.080 | fail (advisory) |
| live.hit.share50ms | drifting-tempo.wav | dancing-character | drifting | 0.304 | 0.375 | 4 | - | 0.900 | 0.286 | pass (advisory) |
| live.hit.share50ms | drifting-tempo.wav | trio-color-wave | drifting | 0.366 | 0.107 | 4 | - | 0.900 | 0.366 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | cubes | synthetic | 0.255 | 0.010 | 4 | - | 0.900 | 0.255 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | dancing-character | synthetic | 0.000 | 0.000 | 4 | - | 0.900 | 0.000 | pass (advisory) |
| live.hit.share50ms | drums-100.wav | trio-color-wave | synthetic | 0.265 | 0.000 | 4 | - | 0.900 | 0.265 | pass (advisory) |
| live.hit.share50ms | drums-128.wav | cubes | synthetic | 0.262 | 0.008 | 4 | - | 0.900 | 0.270 | pass (advisory) |
| live.hit.share50ms | drums-128.wav | dancing-character | synthetic | 0.698 | 0.770 | 4 | - | 0.900 | 0.760 | fail (advisory) |
| live.hit.share50ms | drums-128.wav | trio-color-wave | synthetic | 0.270 | 0.000 | 4 | - | 0.900 | 0.270 | pass (advisory) |
| live.hit.share50ms | drums-150.wav | cubes | synthetic | 0.215 | 0.070 | 4 | - | 0.900 | 0.472 | fail (advisory) |
| live.hit.share50ms | drums-150.wav | dancing-character | synthetic | 0.243 | 0.757 | 4 | - | 0.900 | 0.757 | fail (advisory) |
| live.hit.share50ms | drums-150.wav | trio-color-wave | synthetic | 0.260 | 0.000 | 4 | - | 0.900 | 0.260 | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | cubes | tapped | 0.338 | 0.108 | 4 | - | 0.900 | 0.365 | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | dancing-character | tapped | 0.135 | 0.081 | 4 | - | 0.900 | 0.135 | pass (advisory) |
| live.hit.share50ms | half-time-shuffle.wav | trio-color-wave | tapped | 0.405 | 0.081 | 4 | - | 0.900 | 0.405 | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | cubes | tapped | 0.018 | 0.035 | 4 | - | 0.900 | 0.012 | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | dancing-character | tapped | 0.012 | 0.048 | 4 | - | 0.900 | - | pass (advisory) |
| live.hit.share50ms | high-bpm-dnb.wav | trio-color-wave | tapped | 0.041 | 0.024 | 4 | - | 0.900 | 0.035 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | cubes | tapped | 0.697 | 0.039 | 4 | - | 0.900 | 0.618 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | dancing-character | tapped | 0.572 | 0.105 | 4 | - | 0.900 | 0.428 | pass (advisory) |
| live.hit.share50ms | imyourgirl.wav | trio-color-wave | tapped | 0.809 | 0.079 | 4 | - | 0.900 | 0.809 | pass (advisory) |
| live.hit.share50ms | lonley.wav | cubes | tapped | 0.107 | 0.043 | 4 | - | 0.900 | 0.114 | pass (advisory) |
| live.hit.share50ms | lonley.wav | dancing-character | tapped | 0.386 | 0.500 | 4 | - | 0.900 | 0.293 | pass (advisory) |
| live.hit.share50ms | lonley.wav | trio-color-wave | tapped | 0.186 | 0.057 | 4 | - | 0.900 | 0.171 | pass (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | cubes | tapped | 0.100 | 0.029 | 4 | - | 0.900 | 0.157 | fail (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | dancing-character | tapped | 0.000 | 0.000 | 4 | - | 0.900 | 0.000 | pass (advisory) |
| live.hit.share50ms | low-bpm-rnb.wav | trio-color-wave | tapped | 0.157 | 0.029 | 4 | - | 0.900 | 0.200 | fail (advisory) |
| live.hit.share50ms | summer2000.wav | cubes | tapped | 0.237 | 0.102 | 4 | - | 0.900 | 0.034 | pass (advisory) |
| live.hit.share50ms | summer2000.wav | dancing-character | tapped | 0.000 | 0.068 | 3 | - | 0.900 | 0.017 | pass (advisory) |
| live.hit.share50ms | summer2000.wav | trio-color-wave | tapped | 0.085 | 0.051 | 4 | - | 0.900 | 0.119 | pass (advisory) |
| live.hit.share50ms | syncopation-no-kick.wav | dancing-character | tapped | - | 0.000 | 0 | - | 0.900 | - | n/a |
| live.hit.share50ms | syncopationbass.wav | cubes | tapped | 0.152 | 0.036 | 4 | - | 0.900 | 0.161 | pass (advisory) |
| live.hit.share50ms | syncopationbass.wav | dancing-character | tapped | 0.018 | 0.125 | 4 | - | 0.900 | 0.036 | pass (advisory) |
| live.hit.share50ms | syncopationbass.wav | trio-color-wave | tapped | 0.089 | 0.018 | 4 | - | 0.900 | 0.107 | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | cubes | tapped | 0.680 | 0.103 | 4 | - | 0.900 | 0.629 | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | dancing-character | tapped | 0.426 | 0.074 | 4 | - | 0.900 | 0.431 | pass (advisory) |
| live.hit.share50ms | syncopationbass2.wav | trio-color-wave | tapped | 0.032 | 0.032 | 4 | - | 0.900 | 0.032 | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | cubes | synthetic | 0.918 | 0.074 | 4 | - | 0.900 | 1.000 | fail (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | dancing-character | synthetic | 0.702 | 0.714 | 4 | - | 0.900 | 0.702 | pass (advisory) |
| live.hit.share50ms | trap-2to1-double-90.wav | trio-color-wave | synthetic | 1.000 | 0.000 | 4 | - | 0.900 | 1.000 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | cubes | synthetic | 0.478 | 0.030 | 4 | - | 0.900 | 0.507 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | dancing-character | synthetic | 0.742 | 0.032 | 4 | - | 0.900 | 0.742 | pass (advisory) |
| live.hit.share50ms | trap-2to1-half-140.wav | trio-color-wave | synthetic | 0.507 | 0.000 | 4 | - | 0.900 | 0.507 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | cubes | synthetic | 0.456 | 0.035 | 4 | - | 0.900 | 0.491 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | dancing-character | synthetic | 0.526 | 0.140 | 4 | - | 0.900 | 0.569 | pass (advisory) |
| live.hit.share50ms | trap-4to3-120.wav | trio-color-wave | synthetic | 0.492 | 0.000 | 4 | - | 0.900 | 0.492 | pass (advisory) |
| live.lock.spreadSeconds | 6-8-time.wav | dancing-character | tapped | 0.01 | 0.06 | 4 | 2.00 | - | 0.05 | pass (advisory) |
| live.lock.spreadSeconds | drifting-tempo.wav | dancing-character | drifting | 0.01 | 5.10 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | drums-100.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | drums-128.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | drums-150.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | half-time-shuffle.wav | dancing-character | tapped | 0.02 | 0.96 | 4 | 2.00 | - | 0.00 | pass (advisory) |
| live.lock.spreadSeconds | high-bpm-dnb.wav | dancing-character | tapped | 0.05 | 0.22 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | imyourgirl.wav | dancing-character | tapped | 0.01 | 0.06 | 4 | 2.00 | - | 0.01 | pass (advisory) |
| live.lock.spreadSeconds | lonley.wav | dancing-character | tapped | 0.02 | 0.07 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | low-bpm-rnb.wav | dancing-character | tapped | 0.05 | 5.05 | 4 | 2.00 | - | 0.04 | pass (advisory) |
| live.lock.spreadSeconds | summer2000.wav | dancing-character | tapped | 0.01 | 0.05 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | syncopation-no-kick.wav | dancing-character | tapped | 0.06 | 0.20 | 4 | 2.00 | - | 0.06 | pass (advisory) |
| live.lock.spreadSeconds | syncopationbass.wav | dancing-character | tapped | 0.05 | 0.19 | 4 | 2.00 | - | 0.02 | pass (advisory) |
| live.lock.spreadSeconds | syncopationbass2.wav | dancing-character | tapped | 0.01 | 0.04 | 4 | 2.00 | - | 0.00 | pass (advisory) |
| live.lock.spreadSeconds | trap-2to1-double-90.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | trap-2to1-half-140.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.lock.spreadSeconds | trap-4to3-120.wav | dancing-character | synthetic | - | 0.00 | 0 | 2.00 | - | - | n/a |
| live.reaction.latencyMs | 6-8-time.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | drifting-tempo.wav | cubes | drifting | 225.2 | 7.5 | 4 | - | 46.7 | 223.4 | pass (advisory) |
| live.reaction.latencyMs | drifting-tempo.wav | dancing-character | drifting | 17.0 | 230.0 | 4 | - | 46.7 | 15.2 | pass (advisory) |
| live.reaction.latencyMs | drifting-tempo.wav | trio-color-wave | drifting | 83.3 | 11.0 | 4 | - | 46.7 | 87.3 | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | cubes | synthetic | 22.0 | 4.0 | 4 | - | 46.7 | 22.7 | pass (advisory) |
| live.reaction.latencyMs | drums-100.wav | dancing-character | synthetic | - | 0.0 | 0 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | drums-100.wav | trio-color-wave | synthetic | 9.3 | 10.7 | 4 | - | 46.7 | 10.7 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | cubes | synthetic | 31.8 | 8.3 | 4 | - | 46.7 | 29.3 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | dancing-character | synthetic | 36.4 | 11.6 | 3 | - | 46.7 | 34.5 | pass (advisory) |
| live.reaction.latencyMs | drums-128.wav | trio-color-wave | synthetic | 15.0 | 3.3 | 4 | - | 46.7 | 14.5 | pass (advisory) |
| live.reaction.latencyMs | drums-150.wav | cubes | synthetic | 40.0 | 10.0 | 4 | - | 46.7 | 30.8 | pass (advisory) |
| live.reaction.latencyMs | drums-150.wav | dancing-character | synthetic | 44.0 | 10.0 | 2 | - | 46.7 | 31.0 | unavailable (advisory) |
| live.reaction.latencyMs | drums-150.wav | trio-color-wave | synthetic | 10.7 | 10.7 | 4 | - | 46.7 | 9.3 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | cubes | tapped | 43.8 | 14.8 | 4 | - | 46.7 | 49.4 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | dancing-character | tapped | 72.0 | 15.8 | 4 | - | 46.7 | 75.7 | pass (advisory) |
| live.reaction.latencyMs | half-time-shuffle.wav | trio-color-wave | tapped | 38.7 | 2.7 | 4 | - | 46.7 | 42.7 | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | cubes | tapped | 91.6 | 19.0 | 4 | - | 46.7 | 100.7 | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | dancing-character | tapped | 96.0 | 37.7 | 4 | - | 46.7 | - | pass (advisory) |
| live.reaction.latencyMs | high-bpm-dnb.wav | trio-color-wave | tapped | 68.3 | 6.5 | 4 | - | 46.7 | 66.5 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | cubes | tapped | 38.8 | 0.3 | 4 | - | 46.7 | 49.0 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | dancing-character | tapped | 45.9 | 10.4 | 4 | - | 46.7 | 49.6 | pass (advisory) |
| live.reaction.latencyMs | imyourgirl.wav | trio-color-wave | tapped | 27.3 | 8.0 | 4 | - | 46.7 | 25.5 | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | cubes | tapped | 53.6 | 19.0 | 4 | - | 46.7 | 70.9 | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | dancing-character | tapped | 38.8 | 187.0 | 4 | - | 46.7 | 53.3 | pass (advisory) |
| live.reaction.latencyMs | lonley.wav | trio-color-wave | tapped | 38.8 | 16.0 | 4 | - | 46.7 | 38.8 | pass (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | cubes | tapped | 43.0 | 19.0 | 4 | - | 46.7 | 33.3 | pass (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | - | unavailable (advisory) |
| live.reaction.latencyMs | low-bpm-rnb.wav | trio-color-wave | tapped | 65.1 | 10.1 | 4 | - | 46.7 | 69.2 | pass (advisory) |
| live.reaction.latencyMs | summer2000.wav | cubes | tapped | 98.2 | 13.0 | 4 | - | 46.7 | 144.2 | pass (advisory) |
| live.reaction.latencyMs | summer2000.wav | dancing-character | tapped | 78.7 | 138.0 | 2 | - | 46.7 | 104.0 | unavailable (advisory) |
| live.reaction.latencyMs | summer2000.wav | trio-color-wave | tapped | 86.7 | 21.2 | 4 | - | 46.7 | 90.5 | pass (advisory) |
| live.reaction.latencyMs | syncopation-no-kick.wav | dancing-character | tapped | - | 0.0 | 0 | - | 46.7 | - | n/a |
| live.reaction.latencyMs | syncopationbass.wav | cubes | tapped | 89.3 | 8.0 | 4 | - | 46.7 | 69.7 | fail (advisory) |
| live.reaction.latencyMs | syncopationbass.wav | dancing-character | tapped | 125.5 | 197.7 | 4 | - | 46.7 | 89.9 | fail (advisory) |
| live.reaction.latencyMs | syncopationbass.wav | trio-color-wave | tapped | 64.0 | 8.0 | 4 | - | 46.7 | 68.0 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | cubes | tapped | 40.2 | 8.0 | 4 | - | 46.7 | 45.0 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | dancing-character | tapped | 43.0 | 10.0 | 4 | - | 46.7 | 49.2 | pass (advisory) |
| live.reaction.latencyMs | syncopationbass2.wav | trio-color-wave | tapped | 68.3 | 1.2 | 4 | - | 46.7 | 68.2 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | cubes | synthetic | 38.7 | 5.3 | 4 | - | 46.7 | 31.0 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | dancing-character | synthetic | 35.7 | 3.3 | 3 | - | 46.7 | 33.3 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-double-90.wav | trio-color-wave | synthetic | 35.7 | 3.0 | 4 | - | 46.7 | 35.8 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | cubes | synthetic | 26.1 | 0.9 | 4 | - | 46.7 | 14.6 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | dancing-character | synthetic | 33.6 | 1.6 | 4 | - | 46.7 | 24.6 | pass (advisory) |
| live.reaction.latencyMs | trap-2to1-half-140.wav | trio-color-wave | synthetic | 14.5 | 0.9 | 4 | - | 46.7 | 14.3 | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | cubes | synthetic | 25.2 | 17.4 | 4 | - | 46.7 | 29.9 | pass (advisory) |
| live.reaction.latencyMs | trap-4to3-120.wav | dancing-character | synthetic | 39.5 | 17.5 | 4 | - | 46.7 | 35.5 | pass (advisory) |
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
