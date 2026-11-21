# Order scorecard (AC11)

Targets version 8, revision f3e3cea, created 2026-11-21T16:24:45.564Z, live cells from 5dda495.

54 rows: 50 pass, 4 fail, 0 not judged.

Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.

| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| dancing-character,cubes | drums-128.wav | dancing-character | gain | hub | 0.0549 | 0.0661 | 0.2335 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | bassRaw | hub | 0.0224 | 0.0251 | 0.0277 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetKick | hub | 0.1023 | 0.1067 | 0.1357 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetMid | hub | 0.1151 | 0.1193 | 0.1518 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | onsetHigh | hub | 0.1254 | 0.1304 | 0.1584 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | dancing-character.in | hub | 0.0593 | 0.0647 | 0.1008 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.hit.share50ms | reaction | 0.7984 | 0.8265 | 0.1387 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.reaction.latencyMs | reaction | 35.75 | 34.1875 | 6.875 | pass |  |
| dancing-character,cubes | drums-128.wav | dancing-character | live.falseFire.share | reaction | 0.01 | 0 | 0.1489 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | gain | hub | 0.3739 | 0.2441 | 0.3739 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | bassRaw | hub | 0.0214 | 0.0198 | 0.027 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetKick | hub | 0.1298 | 0.0807 | 0.1298 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetMid | hub | 0.1384 | 0.0874 | 0.1384 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | onsetHigh | hub | 0.1431 | 0.0999 | 0.146 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | cubes.in | hub | 0.0436 | 0.0282 | 0.0436 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.hit.share50ms | reaction | 0.2698 | 0.2705 | 0.0075 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.reaction.latencyMs | reaction | 27.675 | 28.5 | 5.5 | pass |  |
| dancing-character,cubes | drums-128.wav | cubes | live.falseFire.share | reaction | 0.622 | 0.6372 | 0.0361 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | gain | hub | 0.0077 | 0.0069 | 0.0102 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | bassRaw | hub | 0.0093 | 0.015 | 0.016 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetKick | hub | 0.1326 | 0.1385 | 0.1414 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetMid | hub | 0.1279 | 0.129 | 0.1521 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | onsetHigh | hub | 0.1273 | 0.1268 | 0.1501 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | dancing-character.in | hub | 0.0215 | 0.0379 | 0.0273 | FAIL |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.hit.share50ms | reaction | 0.3882 | 0.3947 | 0.1316 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.reaction.latencyMs | reaction | 51.8333 | 51.75 | 2.6667 | pass |  |
| dancing-character,cubes | imyourgirl.wav | dancing-character | live.falseFire.share | reaction | 0.5462 | 0.5313 | 0.163 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | gain | hub | 0.0074 | 0.0081 | 0.0074 | FAIL |  |
| dancing-character,cubes | imyourgirl.wav | cubes | bassRaw | hub | 0.0141 | 0.0087 | 0.0155 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetKick | hub | 0.133 | 0.125 | 0.1422 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetMid | hub | 0.1312 | 0.1189 | 0.1493 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | onsetHigh | hub | 0.1273 | 0.1171 | 0.143 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | cubes.in | hub | 0.0123 | 0.0109 | 0.0123 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.hit.share50ms | reaction | 0.5263 | 0.5789 | 0.1579 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.reaction.latencyMs | reaction | 51.1667 | 41.5 | 10 | pass |  |
| dancing-character,cubes | imyourgirl.wav | cubes | live.falseFire.share | reaction | 0.5531 | 0.5027 | 0.1413 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | gain | hub | 0.0709 | 0.1153 | 0.0829 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | bassRaw | hub | 0.0132 | 0.0114 | 0.0132 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetKick | hub | 0.1099 | 0.1501 | 0.1486 | FAIL |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetMid | hub | 0.0872 | 0.0976 | 0.1252 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | onsetHigh | hub | 0.1037 | 0.0991 | 0.14 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | dancing-character.in | hub | 0.0871 | 0.0469 | 0.0871 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.hit.share50ms | reaction | 0.4516 | 0.4508 | 0.1995 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.reaction.latencyMs | reaction | 48 | 49.3333 | 11 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | dancing-character | live.falseFire.share | reaction | 0.4228 | 0.4324 | 0.2232 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | gain | hub | 0.0568 | 0.0531 | 0.1139 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | bassRaw | hub | 0.0148 | 0.0141 | 0.016 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetKick | hub | 0.1182 | 0.1146 | 0.1544 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetMid | hub | 0.1132 | 0.0982 | 0.1223 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | onsetHigh | hub | 0.1202 | 0.1163 | 0.147 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | cubes.in | hub | 0.0155 | 0.0148 | 0.019 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.hit.share50ms | reaction | 0.6452 | 0.6586 | 0.0923 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.reaction.latencyMs | reaction | 49.15 | 41.3333 | 10.15 | pass |  |
| dancing-character,cubes | syncopationbass2.wav | cubes | live.falseFire.share | reaction | 0.3836 | 0.3413 | 0.1276 | pass |  |
