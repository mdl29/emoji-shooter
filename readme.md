# Emoji Shooter

![alt](/src/img1.jpg)

## Description
Emoji Shooter is a physical interactive shooting game where players use a rubber band gun to shoot jumping emoji targets. Each target is equipped with a switch-based detection system that registers successful hits.

You can shoot 😭😲😘😂💩😈

## Inpirations
The gun : https://makerworld.com/fr/models/56969-rubber-gun-rubber-band-pistol?from=search#profileId-58671

Original Jumping Targets : https://www.thingiverse.com/thing:1306585

## How does it work ?
Each emoji target is mounted on a base that contains a physical switch. When the target is in place (i.e., standing upright), it presses down on the switch. When the target is hit by a rubber band, it jumps or falls, releasing pressure from the switch. This change in state is detected by the microcontroller as a successful hit.

### Sequence:

1. The target is positioned on its base, holding the switch in the "pressed" state.

2. The player shoots a rubber band at the target.

3. A successful hit causes the target to move or fall off the base.

4. The switch is released (returns to "unpressed" state).

5. The microcontroller detects this transition and registers the hit.

This simple mechanism allows reliable and low-latency hit detection using only mechanical switches—no need for complex sensors.

## Usage
```bash
git clone https://github.com/mdl29/emoji-shooter.git
cd emoji-shooter/server
python app.py
```