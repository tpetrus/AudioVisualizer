# Order scorecard (AC11)

Targets version 9, revision 647e948, created 2026-11-25T02:02:28.273Z, settle 0 s, live cells from 647e948.

54 rows: 49 pass, 5 fail, 0 not judged.

Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.

| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| dancing-character,cubes | drums-128.wav | dancing-character | gain | hub | 0.1771 | 0.0703 | 0.1771 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | bassRaw | hub | 0.0253 | 0.0246 | 0.0272 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetKick | hub | 0.1149 | 0.113 | 0.1295 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetMid | hub | 0.1323 | 0.1244 | 0.1428 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetHigh | hub | 0.1397 | 0.1362 | 0.153 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | dancing-character.in | hub | 0.0462 | 0.0535 | 0.061 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.hit.share50ms | reaction | 0.8065 | 0.8197 | 0.023 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.reaction.latencyMs | reaction | 33.05 | 36.0625 | 3.25 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.falseFire.share | reaction | 0 | 0.0098 | 0.02 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | gain | hub | 0.2948 | 0.191 | 0.2948 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | bassRaw | hub | 0.0241 | 0.0219 | 0.0271 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetKick | hub | 0.1243 | 0.1147 | 0.1276 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetMid | hub | 0.1321 | 0.1318 | 0.1424 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetHigh | hub | 0.1369 | 0.1397 | 0.1545 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | cubes.in | hub | 0.0398 | 0.034 | 0.0398 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.hit.share50ms | reaction | 0.2698 | 0.2623 | 0.0075 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.reaction.latencyMs | reaction | 28.675 | 28.025 | 4 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.falseFire.share | reaction | 0.595 | 0.6188 | 0.0742 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | gain | hub | 0.0074 | 0.0067 | 0.0077 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | bassRaw | hub | 0.0126 | 0.0117 | 0.0159 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetKick | hub | 0.1431 | 0.1365 | 0.1512 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetMid | hub | 0.1357 | 0.1317 | 0.1498 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetHigh | hub | 0.1314 | 0.1272 | 0.1452 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | dancing-character.in | hub | 0.0267 | 0.0359 | 0.0301 | FAIL |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.hit.share50ms | reaction | 0.4211 | 0.3947 | 0.1316 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.reaction.latencyMs | reaction | 50.75 | 50.8333 | 2.8333 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.falseFire.share | reaction | 0.5077 | 0.5279 | 0.1538 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | gain | hub | 0.0051 | 0.0048 | 0.0051 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | bassRaw | hub | 0.0104 | 0.015 | 0.016 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetKick | hub | 0.1512 | 0.1384 | 0.1512 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetMid | hub | 0.1534 | 0.1281 | 0.1534 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetHigh | hub | 0.1444 | 0.128 | 0.1444 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | cubes.in | hub | 0.0113 | 0.0123 | 0.0131 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.hit.share50ms | reaction | 0.5724 | 0.5329 | 0.1053 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.reaction.latencyMs | reaction | 41.5833 | 47.4167 | 7.5 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.falseFire.share | reaction | 0.5139 | 0.5341 | 0.1018 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | gain | hub | 0.052 | 0.104 | 0.083 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | bassRaw | hub | 0.0129 | 0.013 | 0.0159 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetKick | hub | 0.1705 | 0.1417 | 0.2381 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetMid | hub | 0.109 | 0.1088 | 0.1269 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetHigh | hub | 0.1122 | 0.1127 | 0.1379 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | dancing-character.in | hub | 0.0858 | 0.0618 | 0.0858 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.hit.share50ms | reaction | 0.4839 | 0.4262 | 0.1388 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.reaction.latencyMs | reaction | 49.1667 | 49.1667 | 3 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.falseFire.share | reaction | 0.3892 | 0.4523 | 0.1573 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | gain | hub | 0.0498 | 0.0631 | 0.0498 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | bassRaw | hub | 0.0127 | 0.0134 | 0.016 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetKick | hub | 0.1437 | 0.1578 | 0.1505 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetMid | hub | 0.1222 | 0.1148 | 0.1222 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetHigh | hub | 0.1181 | 0.1288 | 0.1438 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | cubes.in | hub | 0.0143 | 0.0154 | 0.0151 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.hit.share50ms | reaction | 0.6532 | 0.6129 | 0.082 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.reaction.latencyMs | reaction | 47 | 48 | 10.15 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.falseFire.share | reaction | 0.3617 | 0.3766 | 0.0873 | pass |  |
