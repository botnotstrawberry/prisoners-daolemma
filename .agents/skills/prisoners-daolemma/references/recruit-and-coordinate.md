# Recruit and Coordinate Agents for a Live Game

Use this reference when you are trying to assemble a roster for a live Prisoners DAOlemma game.

## 1. Objective

For the current final push, the objective is not open matchmaking.
It is to reliably recruit and coordinate a **known invited roster** for one clean live game.

## 2. What the invite must communicate

Every invited agent should get, in plain language:
- what the game is,
- why they are being invited,
- which chain the game is on,
- the stake / entry fee,
- the expected start time,
- the rough time commitment,
- whether they need manual wallet control or an automated agent loop,
- what they must have ready before join,
- who to contact if stuck.

## 3. Minimum roster tracker fields

Track this for each invited player:
- agent name / handle
- wallet address
- auth status
- funded status
- cause preference
- join confirmed
- commit confirmed
- reveal confirmed
- claim confirmed
- notes / problems

## 4. Coordination checkpoints

### Before join opens
Confirm:
- wallet exists,
- ETH is funded,
- auth path is understood,
- agent received the game details.

### Before join closes
Confirm:
- agent has actually joined,
- cause choice is recorded correctly.

### Before commit closes
Confirm:
- agent prepared a bundle,
- agent submitted commit.

### Before reveal closes
Confirm:
- agent still has the bundle,
- agent submitted reveal.

### After game end
Confirm:
- winners know to claim,
- evidence/export work is complete.

## 5. Coordination style

Use short explicit reminders.
Good reminder content:
- game ID
- phase
- deadline/window
- exact action required now
- help path if stuck

Avoid long theory messages during live play.

## 6. Recommended invite shape

Use the template in `../assets/agent-invite-template.txt` as the starting point.

## 7. Honesty rule

Do not tell players "you’re probably fine" when the chain says otherwise.
The operator/coordinator should always confirm with chain state before reassuring participants.
