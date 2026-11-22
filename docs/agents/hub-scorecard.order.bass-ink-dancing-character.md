# Order scorecard (AC11)

Targets version 9, revision 4ab6eaf, created 2026-11-22T18:24:08.835Z, live cells from 4ab6eaf.

54 rows: 44 pass, 10 fail, 0 not judged.

Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.

| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |
|---|---|---|---|---|---|---|---|---|---|
| bass-ink,dancing-character | drums-128.wav | bass-ink | gain | hub | 0.068 | 0.0631 | 0.068 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | bassRaw | hub | 0.0268 | 0.03 | 0.0268 | FAIL |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetKick | hub | 0.1133 | 0.1113 | 0.1321 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetMid | hub | 0.12 | 0.1288 | 0.1482 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | onsetHigh | hub | 0.1298 | 0.1403 | 0.1587 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | bass-ink.in | hub | 0.0637 | 0.0826 | 0.0637 | FAIL |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.hit.share50ms | reaction | 0.7698 | 0.6825 | 0.0952 | pass |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.reaction.latencyMs | reaction | 35.25 | 40.375 | 5 | FAIL |  |
| bass-ink,dancing-character | drums-128.wav | bass-ink | live.falseFire.share | reaction | 0.049 | 0.14 | 0.0816 | FAIL |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | gain | hub | 0.0738 | 0.0979 | 0.2703 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | bassRaw | hub | 0.0258 | 0.0265 | 0.0305 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetKick | hub | 0.1137 | 0.1123 | 0.1261 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetMid | hub | 0.1349 | 0.1225 | 0.1424 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | onsetHigh | hub | 0.1383 | 0.131 | 0.1504 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | dancing-character.in | hub | 0.0684 | 0.0705 | 0.1062 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.hit.share50ms | reaction | 0.7723 | 0.7295 | 0.0956 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.reaction.latencyMs | reaction | 35.25 | 38.8625 | 6.9 | pass |  |
| bass-ink,dancing-character | drums-128.wav | dancing-character | live.falseFire.share | reaction | 0.05 | 0.11 | 0.1 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | gain | hub | 0.0061 | 0.0075 | 0.0094 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | bassRaw | hub | 0.0155 | 0.0153 | 0.0155 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetKick | hub | 0.1328 | 0.1393 | 0.1379 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetMid | hub | 0.1296 | 0.1345 | 0.1427 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | onsetHigh | hub | 0.1278 | 0.1346 | 0.1399 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | bass-ink.in | hub | 0.0334 | 0.0336 | 0.0334 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.hit.share50ms | reaction | 0.4079 | 0.4079 | 0.1974 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.reaction.latencyMs | reaction | 52 | 52 | 4.6667 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | bass-ink | live.falseFire.share | reaction | 0.547 | 0.5441 | 0.2112 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | gain | hub | 0.0064 | 0.0059 | 0.0082 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | bassRaw | hub | 0.0156 | 0.0157 | 0.0156 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetKick | hub | 0.135 | 0.1315 | 0.1384 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetMid | hub | 0.1276 | 0.1334 | 0.1445 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | onsetHigh | hub | 0.1291 | 0.1303 | 0.1414 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | dancing-character.in | hub | 0.0494 | 0.0516 | 0.0494 | FAIL |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.hit.share50ms | reaction | 0.4013 | 0.3224 | 0.1579 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.reaction.latencyMs | reaction | 51.9167 | 52 | 4.5 | pass |  |
| bass-ink,dancing-character | imyourgirl.wav | dancing-character | live.falseFire.share | reaction | 0.5308 | 0.6172 | 0.1846 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | gain | hub | 0.0444 | 0.0746 | 0.0864 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | bassRaw | hub | 0.0143 | 0.0146 | 0.0159 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetKick | hub | 0.184 | 0.1457 | 0.184 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetMid | hub | 0.1149 | 0.1096 | 0.1171 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | onsetHigh | hub | 0.1207 | 0.1201 | 0.134 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | bass-ink.in | hub | 0.0111 | 0.0112 | 0.0111 | FAIL |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.hit.share50ms | reaction | 0.4597 | 0.4677 | 0.2097 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.reaction.latencyMs | reaction | 50.8333 | 52.1667 | 10.6667 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | bass-ink | live.falseFire.share | reaction | 0.4568 | 0.4375 | 0.22 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | gain | hub | 0.0546 | 0.1618 | 0.0546 | FAIL |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | bassRaw | hub | 0.0144 | 0.0143 | 0.0155 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetKick | hub | 0.1424 | 0.1428 | 0.1494 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetMid | hub | 0.1127 | 0.0994 | 0.1147 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | onsetHigh | hub | 0.1266 | 0.1086 | 0.1336 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | dancing-character.in | hub | 0.0929 | 0.074 | 0.0929 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.hit.share50ms | reaction | 0.3871 | 0.3689 | 0.202 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.reaction.latencyMs | reaction | 57 | 57 | 8.3333 | pass |  |
| bass-ink,dancing-character | syncopationbass2.wav | dancing-character | live.falseFire.share | reaction | 0.4947 | 0.5264 | 0.2411 | pass |  |
