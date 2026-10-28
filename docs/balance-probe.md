# Bounded software balance probe

Generated: 2026-10-27T14:13:04.787Z

Run with `node scripts/balance-probe.mjs`. This fixed probe plays 20 deterministic classic seeds once each, then makes one attempt against each Boss that those actual runs can forge. It uses only ordinary `step(game, {x, y, dash})` inputs. Every completed run is recomputed with `runReplay`, including an exact trajectory comparison.

These results are software balance signals. The controllers have exact positions, fixed 60 Hz decisions and short trajectory lookahead. They do not measure human enjoyment, control usability, retention or viral potential. Browser frame rate, rendering and network behaviour are outside this probe.

## Fixed policies

Classic: pursue the nearest reachable light; steer away from nearby echoes and walls; dash toward a close echo when ready; use early-game dashes to close large gaps to lights.

Boss: pursue a 150 ms future position; dash when the target is within 135 px; collect nearby lights during cooldown; steer away while recharging. This is a single basic pursuit policy, not a solver. No core balance values were changed.

## Summary

- Classic survival: 20/20; forging eligibility: 20/20.
- Boss success: 20/20; timeout losses: 0; other losses are collisions.
- Every generated Boss was beaten by this controller. This supports mechanical solvability for this sample, but may also indicate that interception is easy once the trajectory is known.
- All runs produced a shareable trajectory, so the current forge threshold is reachable by this collection policy.
- No simulation state was patched. No controller tuning sweep or repeated attempts per seed was performed.

```json
{
  "runs": 20,
  "classicWins": 20,
  "forgeEligible": 20,
  "bossRuns": 20,
  "bossWins": 20,
  "bossTimeouts": 0,
  "classicMeanSeconds": 60,
  "classicMeanLights": 41.75,
  "classicMeanShatters": 15.05,
  "bossMeanHits": 9,
  "allReplaysVerified": true
}
```

## Per-seed results

| Source seed suffix | Classic result | Seconds | Lights | Shatters | Score | Forge | Boss result | Boss hits / 9 | Boss seconds |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 01 | won | 60.00 | 41 | 19 | 3650 | yes | won (boss-defeated) | 9 | 22.82 |
| 02 | won | 60.00 | 42 | 16 | 3360 | yes | won (boss-defeated) | 9 | 24.13 |
| 03 | won | 60.00 | 42 | 14 | 3370 | yes | won (boss-defeated) | 9 | 21.63 |
| 04 | won | 60.00 | 42 | 16 | 3350 | yes | won (boss-defeated) | 9 | 25.12 |
| 05 | won | 60.00 | 42 | 15 | 3570 | yes | won (boss-defeated) | 9 | 23.00 |
| 06 | won | 60.00 | 42 | 13 | 3330 | yes | won (boss-defeated) | 9 | 18.73 |
| 07 | won | 60.00 | 43 | 12 | 3040 | yes | won (boss-defeated) | 9 | 24.40 |
| 08 | won | 60.00 | 41 | 13 | 3280 | yes | won (boss-defeated) | 9 | 18.48 |
| 09 | won | 60.00 | 41 | 15 | 3540 | yes | won (boss-defeated) | 9 | 20.37 |
| 10 | won | 60.00 | 42 | 14 | 3340 | yes | won (boss-defeated) | 9 | 18.55 |
| 11 | won | 60.00 | 42 | 15 | 3330 | yes | won (boss-defeated) | 9 | 21.07 |
| 12 | won | 60.00 | 42 | 17 | 3700 | yes | won (boss-defeated) | 9 | 21.72 |
| 13 | won | 60.00 | 41 | 16 | 3640 | yes | won (boss-defeated) | 9 | 21.63 |
| 14 | won | 60.00 | 42 | 18 | 3700 | yes | won (boss-defeated) | 9 | 22.92 |
| 15 | won | 60.00 | 41 | 17 | 3390 | yes | won (boss-defeated) | 9 | 17.62 |
| 16 | won | 60.00 | 43 | 12 | 3290 | yes | won (boss-defeated) | 9 | 20.60 |
| 17 | won | 60.00 | 42 | 14 | 3370 | yes | won (boss-defeated) | 9 | 18.67 |
| 18 | won | 60.00 | 41 | 16 | 3520 | yes | won (boss-defeated) | 9 | 23.50 |
| 19 | won | 60.00 | 42 | 15 | 3330 | yes | won (boss-defeated) | 9 | 19.33 |
| 20 | won | 60.00 | 41 | 14 | 3060 | yes | won (boss-defeated) | 9 | 23.82 |

Full source seed prefix: `balance-2026-10-27-`.

## Reproducible browser-flow sample

Source seed: `balance-2026-10-27-01`. Forge code comes from the actual live run, not a fabricated path. Both the source and Boss results below were recomputed from their recorded inputs. Append `?boss=<code>` to the game URL if that is the UI's challenge parameter.

```text
QVlCAWRJc0qBTY5VbF9dYk5lQGgxayJuFHEfcS5wRG5kbHNrgmqRaZ5nkWCEWpJViVBnRVU-RzpDO0xHVVNeX1tQZU5sWnNnemeFaI1sjm2AaH9ojmqOap1onWKIUXNHZEVVQkdAOD0pOxo4ITowPT5ATEVZTWhOd1CGUp1toGKjU6pGsDi0LaYzmTqLQH5IclBNWVhhZmR1aINrkm-hcq92pnSYcnRidGJlYVZhR2A4YC5aMEsvPS4wKzgnSDZKRU1QUUxgWl1pWnVcel2OX5dmiGN5YWpfW11oZXVsbmtgaFVHR0M5QStCIk4pSzZDMjg9M0wyWzNlQlToYiA
```

```json
{
  "code": "QVlCAWRJc0qBTY5VbF9dYk5lQGgxayJuFHEfcS5wRG5kbHNrgmqRaZ5nkWCEWpJViVBnRVU-RzpDO0xHVVNeX1tQZU5sWnNnemeFaI1sjm2AaH9ojmqOap1onWKIUXNHZEVVQkdAOD0pOxo4ITowPT5ATEVZTWhOd1CGUp1toGKjU6pGsDi0LaYzmTqLQH5IclBNWVhhZmR1aINrkm-hcq92pnSYcnRidGJlYVZhR2A4YC5aMEsvPS4wKzgnSDZKRU1QUUxgWl1pWnVcel2OX5dmiGN5YWpfW11oZXVsbmtgaFVHR0M5QStCIk4pSzZDMjg9M0wyWzNlQlToYiA",
  "source": {
    "seed": "balance-2026-10-27-01",
    "phase": "won",
    "seconds": 60,
    "score": 3650,
    "hp": 3,
    "lights": 41,
    "shatters": 19,
    "bossHits": 0,
    "damage": 0,
    "dashes": 21,
    "distance": 16094,
    "reason": "survived",
    "replayVerified": true,
    "replayHash": "97b378ad6fe81aaa336c6cb750dd66f318821ffb2a5ddef453cfd1d8dbcfe8e3"
  },
  "sourceReplayResult": {
    "phase": "won",
    "score": 3650,
    "hp": 3,
    "lights": 41
  },
  "sourceReplayTicks": 3600,
  "boss": {
    "seed": "boss-54e86220",
    "phase": "won",
    "seconds": 22.82,
    "score": 1650,
    "hp": 2,
    "lights": 14,
    "shatters": 9,
    "bossHits": 9,
    "damage": 1,
    "dashes": 11,
    "distance": 6311,
    "reason": "boss-defeated",
    "replayVerified": true,
    "replayHash": "be04be7ad5c6dee454660fc21d3b2dff1247d2abf4832fc31629b708d6a5a25e"
  },
  "bossReplayResult": {
    "phase": "won",
    "score": 1650,
    "hp": 2,
    "lights": 14
  },
  "bossReplayTicks": 1369
}
```

## All verification records

Hashes are SHA-256 of the exact exported replay JSON, so rerunning the fixed script can check reproducibility without storing large companion files. Replay result metadata alone is not trusted: the script verifies it through the engine first.

```json
[
  {
    "classic": {
      "seed": "balance-2026-10-27-01",
      "phase": "won",
      "seconds": 60,
      "score": 3650,
      "hp": 3,
      "lights": 41,
      "shatters": 19,
      "bossHits": 0,
      "damage": 0,
      "dashes": 21,
      "distance": 16094,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "97b378ad6fe81aaa336c6cb750dd66f318821ffb2a5ddef453cfd1d8dbcfe8e3"
    },
    "forge": true,
    "boss": {
      "seed": "boss-54e86220",
      "phase": "won",
      "seconds": 22.82,
      "score": 1650,
      "hp": 2,
      "lights": 14,
      "shatters": 9,
      "bossHits": 9,
      "damage": 1,
      "dashes": 11,
      "distance": 6311,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "be04be7ad5c6dee454660fc21d3b2dff1247d2abf4832fc31629b708d6a5a25e"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-02",
      "phase": "won",
      "seconds": 60,
      "score": 3360,
      "hp": 3,
      "lights": 42,
      "shatters": 16,
      "bossHits": 0,
      "damage": 0,
      "dashes": 18,
      "distance": 15550,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "f898709f1fb89c89bec15b733411a9f3ecea5f60368f5e9e4ecdb61ace4c7dcf"
    },
    "forge": true,
    "boss": {
      "seed": "boss-fa53e5d8",
      "phase": "won",
      "seconds": 24.13,
      "score": 1600,
      "hp": 2,
      "lights": 13,
      "shatters": 9,
      "bossHits": 9,
      "damage": 1,
      "dashes": 11,
      "distance": 6713,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "647ffa54d089a6433219b63776d20b3e2d2bfb29d6472a7604e7d94c788a07ed"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-03",
      "phase": "won",
      "seconds": 60,
      "score": 3370,
      "hp": 3,
      "lights": 42,
      "shatters": 14,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15243,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "fff2f04852df9cac0e1073da8933b06908484341c0578e87d2987923d3ed39e6"
    },
    "forge": true,
    "boss": {
      "seed": "boss-04087be7",
      "phase": "won",
      "seconds": 21.63,
      "score": 1520,
      "hp": 1,
      "lights": 12,
      "shatters": 9,
      "bossHits": 9,
      "damage": 2,
      "dashes": 11,
      "distance": 6063,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "6340d77888cf212c964476df15c5c0c9382b7c34e7d585d99ae27fb06bc671e5"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-04",
      "phase": "won",
      "seconds": 60,
      "score": 3350,
      "hp": 3,
      "lights": 42,
      "shatters": 16,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15691,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "cb3eaf893d3b78576a71d1e39761b5d6c9f1be83fcab63372d13dea604a003d6"
    },
    "forge": true,
    "boss": {
      "seed": "boss-8c172ddc",
      "phase": "won",
      "seconds": 25.12,
      "score": 1850,
      "hp": 3,
      "lights": 15,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 11,
      "distance": 7033,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "a08f27cb655eb45faf302391e0657f8f939e0677d346ec965f30e043c3da7d7e"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-05",
      "phase": "won",
      "seconds": 60,
      "score": 3570,
      "hp": 3,
      "lights": 42,
      "shatters": 15,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15494,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "441f8adb17314d1ce11703544b650c87c57c9ebe5b1972b78dbadbe1089761ef"
    },
    "forge": true,
    "boss": {
      "seed": "boss-797175cb",
      "phase": "won",
      "seconds": 23,
      "score": 1700,
      "hp": 3,
      "lights": 12,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 10,
      "distance": 6412,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "b16f57932cf1168b57f782a120272597415d4c7a46d2d341034e57097e8c0278"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-06",
      "phase": "won",
      "seconds": 60,
      "score": 3330,
      "hp": 3,
      "lights": 42,
      "shatters": 13,
      "bossHits": 0,
      "damage": 0,
      "dashes": 16,
      "distance": 15753,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "24357202aaf2a7ccd38b7cc9fa34238e05836c5a45fe79c99bd57e47675779cb"
    },
    "forge": true,
    "boss": {
      "seed": "boss-22ffc728",
      "phase": "won",
      "seconds": 18.73,
      "score": 1600,
      "hp": 3,
      "lights": 10,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 9,
      "distance": 5212,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "84fb8481dd380c1aa156fb3162f4f35e7d6276a3f81c4c97d9a60d994293d4cf"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-07",
      "phase": "won",
      "seconds": 60,
      "score": 3040,
      "hp": 3,
      "lights": 43,
      "shatters": 12,
      "bossHits": 0,
      "damage": 0,
      "dashes": 15,
      "distance": 15426,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "5983aa1daabb47b21a1d4fb250ebfcca46303cbb7050327a7f2ea6d9f5405701"
    },
    "forge": true,
    "boss": {
      "seed": "boss-9d7a69bb",
      "phase": "won",
      "seconds": 24.4,
      "score": 1610,
      "hp": 2,
      "lights": 12,
      "shatters": 9,
      "bossHits": 9,
      "damage": 1,
      "dashes": 11,
      "distance": 6711,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "4192eecd2d86de68fb96546a7563a28419d5fe54d517a5942f1b7a933f74abf8"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-08",
      "phase": "won",
      "seconds": 60,
      "score": 3280,
      "hp": 3,
      "lights": 41,
      "shatters": 13,
      "bossHits": 0,
      "damage": 0,
      "dashes": 16,
      "distance": 15455,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "d3cb1a4e2e1a706409b6678561381d6112255541a251c4be8f0f0c5ab844e851"
    },
    "forge": true,
    "boss": {
      "seed": "boss-f8fa2a4a",
      "phase": "won",
      "seconds": 18.48,
      "score": 1460,
      "hp": 3,
      "lights": 8,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 9,
      "distance": 5158,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "a60cead3bc5c6795d4d2fbb10800cb7a95fd3a2570d4cc36e9bd9a4f4435e27a"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-09",
      "phase": "won",
      "seconds": 60,
      "score": 3540,
      "hp": 3,
      "lights": 41,
      "shatters": 15,
      "bossHits": 0,
      "damage": 0,
      "dashes": 19,
      "distance": 15539,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "7a5d9e7f1e8d178a1c2b7cb6490ed84bbb3cada068f447c435edd53c3c3dca55"
    },
    "forge": true,
    "boss": {
      "seed": "boss-08a167e9",
      "phase": "won",
      "seconds": 20.37,
      "score": 1800,
      "hp": 3,
      "lights": 14,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 10,
      "distance": 5737,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "ca9f8750abbc240e29ab84ffc10bcbda4c3510ff7df65142d208ee7155712c02"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-10",
      "phase": "won",
      "seconds": 60,
      "score": 3340,
      "hp": 2,
      "lights": 42,
      "shatters": 14,
      "bossHits": 0,
      "damage": 1,
      "dashes": 18,
      "distance": 15563,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "3033757491eb017faf627e7f9f3ee3839e54b028107f5a05c8dbd1e9103407d1"
    },
    "forge": true,
    "boss": {
      "seed": "boss-12fa02ec",
      "phase": "won",
      "seconds": 18.55,
      "score": 1460,
      "hp": 2,
      "lights": 10,
      "shatters": 9,
      "bossHits": 9,
      "damage": 1,
      "dashes": 9,
      "distance": 5082,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "541e305156169601a2d39e0745486045143de1fae42fc14014d86c65134039e3"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-11",
      "phase": "won",
      "seconds": 60,
      "score": 3330,
      "hp": 2,
      "lights": 42,
      "shatters": 15,
      "bossHits": 0,
      "damage": 1,
      "dashes": 18,
      "distance": 15758,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "e009785a2ee6ba0c246a306c50f6c429b8ff26227d1a16f76e83cd09c8fecf27"
    },
    "forge": true,
    "boss": {
      "seed": "boss-e936acd2",
      "phase": "won",
      "seconds": 21.07,
      "score": 1630,
      "hp": 2,
      "lights": 13,
      "shatters": 9,
      "bossHits": 9,
      "damage": 1,
      "dashes": 10,
      "distance": 5984,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "863cdd68e07bb65f8e7fd25e0eea1fdc82dd8fe965b069940ff051bb816526e8"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-12",
      "phase": "won",
      "seconds": 60,
      "score": 3700,
      "hp": 3,
      "lights": 42,
      "shatters": 17,
      "bossHits": 0,
      "damage": 0,
      "dashes": 20,
      "distance": 15741,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "885e0260c5e48a545e24312d804d7ab2c3ba2f02c4dd58063196bd0ff003fb63"
    },
    "forge": true,
    "boss": {
      "seed": "boss-ccb9153a",
      "phase": "won",
      "seconds": 21.72,
      "score": 1800,
      "hp": 3,
      "lights": 14,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 11,
      "distance": 6052,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "17d20fa541da71fe6b05598b991d9c515c45bd2d6dd3256247cbe8fe46576be3"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-13",
      "phase": "won",
      "seconds": 60,
      "score": 3640,
      "hp": 3,
      "lights": 41,
      "shatters": 16,
      "bossHits": 0,
      "damage": 0,
      "dashes": 18,
      "distance": 15557,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "c4c86490b0a3c25a0246a2560af328c728aff7e3e75a17911d29632f2145cfa0"
    },
    "forge": true,
    "boss": {
      "seed": "boss-d135c237",
      "phase": "won",
      "seconds": 21.63,
      "score": 1700,
      "hp": 3,
      "lights": 12,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 10,
      "distance": 5951,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "b63d039d47a5afc203ae0c6700b984eb9449fece6353912745b86e004e715d82"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-14",
      "phase": "won",
      "seconds": 60,
      "score": 3700,
      "hp": 3,
      "lights": 42,
      "shatters": 18,
      "bossHits": 0,
      "damage": 0,
      "dashes": 19,
      "distance": 15630,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "0b8e628ef3f4aa15e3a57fd99f42f2036c2588a5327ef8d881eac28e9143ff0a"
    },
    "forge": true,
    "boss": {
      "seed": "boss-1fcec88e",
      "phase": "won",
      "seconds": 22.92,
      "score": 1420,
      "hp": 1,
      "lights": 11,
      "shatters": 9,
      "bossHits": 9,
      "damage": 2,
      "dashes": 11,
      "distance": 6281,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "2bc907161ccc39a45cd9388fa846fdbeaf216abaaf452414310ac8d900639210"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-15",
      "phase": "won",
      "seconds": 60,
      "score": 3390,
      "hp": 3,
      "lights": 41,
      "shatters": 17,
      "bossHits": 0,
      "damage": 0,
      "dashes": 18,
      "distance": 15765,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "063acd11ad1d5770f0d2c7146db772e231027e99fcde6508767b08f389305045"
    },
    "forge": true,
    "boss": {
      "seed": "boss-0945cb66",
      "phase": "won",
      "seconds": 17.62,
      "score": 1650,
      "hp": 3,
      "lights": 11,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 9,
      "distance": 4944,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "5b7560729187afd601d927c61d8cb47782fce5b41d2d2613237bc8799fab9af2"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-16",
      "phase": "won",
      "seconds": 60,
      "score": 3290,
      "hp": 3,
      "lights": 43,
      "shatters": 12,
      "bossHits": 0,
      "damage": 0,
      "dashes": 16,
      "distance": 15489,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "bcb722f943b519cc668361643446fc826049f2034853c004d73daf8fdd9ace8f"
    },
    "forge": true,
    "boss": {
      "seed": "boss-e866fed6",
      "phase": "won",
      "seconds": 20.6,
      "score": 1450,
      "hp": 1,
      "lights": 9,
      "shatters": 9,
      "bossHits": 9,
      "damage": 2,
      "dashes": 10,
      "distance": 5754,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "906177890460eef5a713732284cff113aea382cf46e12bb976c162736912dd1d"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-17",
      "phase": "won",
      "seconds": 60,
      "score": 3370,
      "hp": 3,
      "lights": 42,
      "shatters": 14,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15612,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "875e0d1777e55dddeb7744c17a4cda91c954298537f9c4c8aa3bbbb58630cccc"
    },
    "forge": true,
    "boss": {
      "seed": "boss-8538199c",
      "phase": "won",
      "seconds": 18.67,
      "score": 1600,
      "hp": 3,
      "lights": 10,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 9,
      "distance": 5291,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "be704be23339ffa82e86e929195eff1687c3a5427955ff785de3b74a3f76fee0"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-18",
      "phase": "won",
      "seconds": 60,
      "score": 3520,
      "hp": 2,
      "lights": 41,
      "shatters": 16,
      "bossHits": 0,
      "damage": 1,
      "dashes": 15,
      "distance": 15392,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "17e1bd433c3c9a5d65fb152e0442a8ec0ab7dca8c2437bf68eaa027f3cde1983"
    },
    "forge": true,
    "boss": {
      "seed": "boss-07a00054",
      "phase": "won",
      "seconds": 23.5,
      "score": 1710,
      "hp": 3,
      "lights": 14,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 12,
      "distance": 6333,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "55f51c6c9df898794d6960fcb281da76bafdd09da0f01a47397013a7c36e67d4"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-19",
      "phase": "won",
      "seconds": 60,
      "score": 3330,
      "hp": 3,
      "lights": 42,
      "shatters": 15,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15521,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "86bb6c070a5e6a5c0bd7973ea44ac0f0b8c11053f4091ddb1e055c40ee8ecddb"
    },
    "forge": true,
    "boss": {
      "seed": "boss-3d4a3c18",
      "phase": "won",
      "seconds": 19.33,
      "score": 1560,
      "hp": 3,
      "lights": 11,
      "shatters": 9,
      "bossHits": 9,
      "damage": 0,
      "dashes": 9,
      "distance": 5445,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "60332b7e8250e801e5e3ba19842c81db46e9cef9115d4fd0d88050714c545a4d"
    }
  },
  {
    "classic": {
      "seed": "balance-2026-10-27-20",
      "phase": "won",
      "seconds": 60,
      "score": 3060,
      "hp": 3,
      "lights": 41,
      "shatters": 14,
      "bossHits": 0,
      "damage": 0,
      "dashes": 17,
      "distance": 15742,
      "reason": "survived",
      "replayVerified": true,
      "replayHash": "8a6f3f1ae0ab525a1190013d8cee74a59ca46dd30a3ddcda720a5f932448dc73"
    },
    "forge": true,
    "boss": {
      "seed": "boss-2d0a5c65",
      "phase": "won",
      "seconds": 23.82,
      "score": 1380,
      "hp": 1,
      "lights": 11,
      "shatters": 9,
      "bossHits": 9,
      "damage": 2,
      "dashes": 11,
      "distance": 6554,
      "reason": "boss-defeated",
      "replayVerified": true,
      "replayHash": "540948abf96aa61deaff3f798223f6d835aa434460d280069a60a27b8da9bb88"
    }
  }
]
```
