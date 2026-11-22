# Order scorecard (AC11)

Targets version 9, revision 4ab6eaf, created 2026-11-22T17:17:28.554Z, live cells from 4ab6eaf.

54 rows: 49 pass, 5 fail, 0 not judged.

Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.

| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| dancing-character,cubes | drums-128.wav | dancing-character | gain | hub | 0.0537 | 0.2011 | 0.1702 | FAIL |  |
| dancing-character,cubes | drums-128.wav | dancing-character | bassRaw | hub | 0.0206 | 0.0191 | 0.0287 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetKick | hub | 0.1105 | 0.1082 | 0.1345 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetMid | hub | 0.1276 | 0.1229 | 0.1515 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetHigh | hub | 0.1359 | 0.1318 | 0.1611 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | dancing-character.in | hub | 0.0499 | 0.0756 | 0.0613 | FAIL |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.hit.share50ms | reaction | 0.8115 | 0.8197 | 0.043 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.reaction.latencyMs | reaction | 32.6875 | 31.875 | 5.25 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.falseFire.share | reaction | 0.01 | 0 | 0.02 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | gain | hub | 0.3604 | 0.2226 | 0.3604 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | bassRaw | hub | 0.0206 | 0.0223 | 0.0281 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetKick | hub | 0.1214 | 0.1088 | 0.1394 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetMid | hub | 0.1334 | 0.1196 | 0.1571 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetHigh | hub | 0.1364 | 0.13 | 0.1632 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | cubes.in | hub | 0.0422 | 0.0291 | 0.0422 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.hit.share50ms | reaction | 0.2698 | 0.2705 | 0.0234 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.reaction.latencyMs | reaction | 28.825 | 28.425 | 5 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.falseFire.share | reaction | 0.6047 | 0.6158 | 0.0921 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | gain | hub | 0.0061 | 0.0059 | 0.008 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | bassRaw | hub | 0.0137 | 0.0127 | 0.016 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetKick | hub | 0.129 | 0.1294 | 0.1476 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetMid | hub | 0.1207 | 0.1167 | 0.1506 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetHigh | hub | 0.1205 | 0.12 | 0.1461 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | dancing-character.in | hub | 0.0266 | 0.0353 | 0.0294 | FAIL |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.hit.share50ms | reaction | 0.3947 | 0.4013 | 0.1447 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.reaction.latencyMs | reaction | 51.6667 | 51.75 | 3 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.falseFire.share | reaction | 0.542 | 0.527 | 0.1692 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | gain | hub | 0.0077 | 0.0066 | 0.0106 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | bassRaw | hub | 0.0126 | 0.0132 | 0.0162 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetKick | hub | 0.1384 | 0.1345 | 0.1559 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetMid | hub | 0.1317 | 0.1174 | 0.1517 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetHigh | hub | 0.1266 | 0.1156 | 0.1462 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | cubes.in | hub | 0.0123 | 0.0119 | 0.0137 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.hit.share50ms | reaction | 0.5526 | 0.5658 | 0.0921 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.reaction.latencyMs | reaction | 49.5833 | 41.5 | 2.7 | FAIL |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.falseFire.share | reaction | 0.528 | 0.5169 | 0.0819 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | gain | hub | 0.0676 | 0.1253 | 0.0832 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | bassRaw | hub | 0.0137 | 0.0141 | 0.0159 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetKick | hub | 0.1408 | 0.1427 | 0.1457 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetMid | hub | 0.1161 | 0.0992 | 0.1161 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetHigh | hub | 0.1301 | 0.1146 | 0.1313 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | dancing-character.in | hub | 0.0856 | 0.0577 | 0.0856 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.hit.share50ms | reaction | 0.4355 | 0.418 | 0.1475 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.reaction.latencyMs | reaction | 49.3333 | 49.5 | 8 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.falseFire.share | reaction | 0.4315 | 0.4574 | 0.1569 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | gain | hub | 0.0689 | 0.0729 | 0.0843 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | bassRaw | hub | 0.014 | 0.0145 | 0.0168 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetKick | hub | 0.1571 | 0.2014 | 0.2123 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetMid | hub | 0.1339 | 0.1196 | 0.1368 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetHigh | hub | 0.1274 | 0.1278 | 0.1502 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | cubes.in | hub | 0.0165 | 0.0174 | 0.0261 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.hit.share50ms | reaction | 0.6613 | 0.629 | 0.119 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.reaction.latencyMs | reaction | 47.8333 | 47.425 | 10.4833 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.falseFire.share | reaction | 0.3644 | 0.3711 | 0.1603 | pass |  |
