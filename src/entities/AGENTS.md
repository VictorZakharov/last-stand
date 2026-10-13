# `src/entities`

The things that move and fight.

The rules across the game are the [root AGENTS.md](../../AGENTS.md); each directory under this one has an AGENTS.md of its own.

- `player.ts`: the player character: input to movement and skills, resources, damage, block, animation, and the remote players' copies in co-op. `movement.ts`: how a hero's body moves over the ground, by pushing against it with its feet.
- `enemy.ts`: an enemy: movement, status effects, actions, damage, death (its decisions are `enemyAI.ts`, its look `models/`). `enemyAI.ts`: the behaviours (each sets a velocity and a facing and starts timed actions; what an attack looks like goes through `fx`, which co-op guests replay). `spawner.ts`: a foe spawned with its summoning effect.
- `viewModel.ts`: first person, the hero's own arms and weapon in view (the Views gotcha in `src/core/AGENTS.md`).

Gear-driven skills and block (`Player.gear`, `tryBlock`) are in `src/combat/skills/AGENTS.md`; how foes find their way round props is `src/world/AGENTS.md`.

## Gotchas

- **Hostile bolts leave the caster's tip** (`fireBolt` in `enemyAI.ts` sends `model.tip`'s height with the `bolt` fx), then settle to the level `BOLT_Y` over their first 2.2m: hits and the clear-shot check (`lineClear`) assume that level. A caster's cast pose should still hold its tip near bolt height (the Sporecaller holds its pod out at the target), so the settling is only a few centimetres.
- **An enemy's blow lands when its animation says so:** the data's `windup` is the one clock. The AI fires the strike, slam or shot at `windup / (windup + recover)` of the action, and `Enemy.animate` hands the same share to the model (`ActionState.hit`, from the data, so a co-op guest's copy has it too). A model's `attack` / `slam` brings the blow down to connect *at* `hit` (raise until just before it, strike ending on it, recover after) and a caster's build-up peaks on it, so a new enemy's animation is written against `a.hit`, never against fixed shares of the action. The dodge window is unchanged: `meleeStrike` still checks range and facing when it fires.
- **The hotbar shows what an action holds up** (`Player.heldUp`, the slot's `busy`, the touch buttons too): while a free-move cast (the healing draught) is under way every other skill, and a consumable while any other action is (a cast, a channel, a dash, a stagger), until the hero has been free for `BUSY_HOLD`: a held attack is free for a frame between its blows and its key, tried before the draught's, takes that frame, so shown free then the draught's slot flashed with every blow. Not every slot while anything is cast: an attack held down would dim the whole bar.
