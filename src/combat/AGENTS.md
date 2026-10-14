# `src/combat`

What hits what.

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- `damage.ts`: damage rolls and how they land, both ways: `hitEnemy` (a player's hit on a foe: his stats, the kill, leech, a mark's extra share), `hurtPlayer` (a foe's on the local hero), `dazeEnemy`, and the damage numbers.
- `projectiles.ts`: every projectile, the players' and the foes': its flight, its world collision (the props, the arena's wall) and its hit.
- `lures.ts`: something standing in the arena that draws foes off the players for a while (the ranger's Strawman, `skills/AGENTS.md`).
- `skills/`: the skills' behaviours.

In co-op a hit counts only where `net/role.ts` says (the root's Co-op rule), so damage stays in `hitEnemy` and hits on players in `hurtPlayer`. Hostile bolts and an enemy's blows are the enemies' (`src/entities/AGENTS.md`).
