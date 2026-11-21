# Order scorecard (AC11)

Targets version 8, revision f3e3cea, created 2026-11-21T16:33:14.448Z, live cells from 5dda495.

54 rows: 49 pass, 5 fail, 0 not judged.

Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.

| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| bass-ink,dancing-character | drums-128.wav | bass-ink | gain | hub | 0.0481 | 0.0592 | 0.068 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | bassRaw | hub | 0.0233 | 0.0238 | 0.0271 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetKick | hub | 0.1155 | 0.1162 | 0.1292 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetMid | hub | 0.1324 | 0.1327 | 0.1473 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetHigh | hub | 0.1395 | 0.1421 | 0.1559 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | bass-ink.in | hub | 0.0185 | 0.0193 | 0.0213 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.hit.share50ms | reaction | 0.8095 | 0.7937 | 0.0317 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.reaction.latencyMs | reaction | 35.25 | 34.75 | 4.5 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.falseFire.share | reaction | 0 | 0 | 0 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | gain | hub | 0.1895 | 0.1363 | 0.2335 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | bassRaw | hub | 0.0212 | 0.0206 | 0.0285 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetKick | hub | 0.1085 | 0.1134 | 0.1357 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetMid | hub | 0.123 | 0.1259 | 0.1518 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetHigh | hub | 0.1305 | 0.1355 | 0.1612 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | dancing-character.in | hub | 0.0608 | 0.0534 | 0.1008 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.hit.share50ms | reaction | 0.7984 | 0.8115 | 0.1387 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.reaction.latencyMs | reaction | 35.75 | 35 | 6.875 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.falseFire.share | reaction | 0.01 | 0.01 | 0.1489 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | gain | hub | 0.0061 | 0.0071 | 0.0061 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | bassRaw | hub | 0.0108 | 0.0131 | 0.0158 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetKick | hub | 0.1337 | 0.1211 | 0.1556 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetMid | hub | 0.1311 | 0.115 | 0.1582 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetHigh | hub | 0.1282 | 0.1136 | 0.1499 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | bass-ink.in | hub | 0.0068 | 0.0075 | 0.0076 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.hit.share50ms | reaction | 0.4276 | 0.4737 | 0.1447 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.reaction.latencyMs | reaction | 51.6667 | 50.4083 | 3 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.falseFire.share | reaction | 0.5256 | 0.4706 | 0.1526 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | gain | hub | 0.0078 | 0.0073 | 0.0081 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | bassRaw | hub | 0.0125 | 0.0145 | 0.0149 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetKick | hub | 0.1332 | 0.131 | 0.1494 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetMid | hub | 0.1295 | 0.1273 | 0.1493 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetHigh | hub | 0.1274 | 0.1247 | 0.146 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | dancing-character.in | hub | 0.027 | 0.0336 | 0.0274 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.hit.share50ms | reaction | 0.3882 | 0.3618 | 0.1184 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.reaction.latencyMs | reaction | 51.8333 | 51.8333 | 2.8333 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.falseFire.share | reaction | 0.5462 | 0.5668 | 0.1474 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | gain | hub | 0.0482 | 0.0648 | 0.065 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | bassRaw | hub | 0.0137 | 0.0135 | 0.0162 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetKick | hub | 0.1423 | 0.1821 | 0.1444 | FAIL |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetMid | hub | 0.0907 | 0.1098 | 0.1221 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetHigh | hub | 0.1021 | 0.1148 | 0.1361 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | bass-ink.in | hub | 0.0087 | 0.0083 | 0.0096 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.hit.share50ms | reaction | 0.5565 | 0.5484 | 0.0806 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.reaction.latencyMs | reaction | 49.15 | 49 | 0.35 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.falseFire.share | reaction | 0.3548 | 0.3648 | 0.0721 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | gain | hub | 0.0528 | 0.1315 | 0.0877 | FAIL |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | bassRaw | hub | 0.0133 | 0.0116 | 0.0159 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetKick | hub | 0.1058 | 0.1487 | 0.1486 | FAIL |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetMid | hub | 0.0777 | 0.1123 | 0.1277 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetHigh | hub | 0.092 | 0.1199 | 0.1404 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | dancing-character.in | hub | 0.0882 | 0.0619 | 0.0882 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.hit.share50ms | reaction | 0.4516 | 0.459 | 0.1995 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.reaction.latencyMs | reaction | 48 | 49.9167 | 11 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.falseFire.share | reaction | 0.4228 | 0.44 | 0.2232 | pass |  |
