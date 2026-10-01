# Supplies, shop and rewards

Issue [#19](https://github.com/King-Zalogon/mossvale/issues/19). One table in `dist/src/data/economy.js`, transactions in `dist/src/domain/economy.js`. Chest and seal rewards stay in the map data (`reward` on the landmark).

| Topic | Rule |
| --- | --- |
| Bag | Coins ≤ 9999, potions ≤ 99, orbs ≤ 99. Rewards stop at the cap; purchases are refused (and cost nothing) if they would not fit |
| Free rest | The ranger heals the whole team and tops the bag up to 12 orbs and 1 potion. It never takes anything away. Spending everything can therefore never strand you: you can always rest, capture and heal |
| Shop | Potion 10 coins; 5 orbs 15 coins. Coins only buy extras |
| Wild win | 8–14 coins, 24 XP |
| Repeat guardian win | 12 coins, 20 XP (the seal and its reward are only paid the first time) |
| Capture | 10 coins, 20 XP (also for a creature you already have) |
| Chests | Pay their listed reward once; remembered by the map flag |
| Seals | Coins, potions and XP from the shrine data, once |

All changes go through `grant`, `buy`, `restAtCamp` and `claimChest`; each either completes or changes nothing, and the save is written right after (refresh at any moment cannot double-pay: see [SAVE_FORMAT.md](SAVE_FORMAT.md#encounter-durability) for battles).

Tuning intent: a potion costs about one wild win, so coins feel useful but never mandatory; chests provide supplies directly. If you catch yourself fighting only for money, lower `REWARDS.wild.coins` or raise the shop prices.
