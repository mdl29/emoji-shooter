# Emoji Shooter

![alt](/.github/images/img1.jpg)

## Description
Emoji Shooter is an interactive shooting game. Players use a rubber band gun to shoot at jumping emoji targets. Each target is equipped with a mechanical switch for hit detection, and the game is tracked by an Arduino Uno. A web frontend displays the score and interacts with the hardware via serial communication.

## Features
- Physical emoji targets with mechanical hit detection
- Arduino firmware for real-time target state tracking
- Web frontend for score display and serial connection
- Visual feedback via LEDs on each target base

## Inspirations
- [Rubber Band Gun Model](https://makerworld.com/en/models/56969)
- [Original Jumping Targets](https://www.thingiverse.com/thing:1306585)

## How does it work?
Each emoji target sits on a base with a mechanical switch. When upright, the target presses the switch. A successful hit causes the target to jump or fall, releasing the switch. The Arduino detects this change and updates the game state.

### Sequence:
1. Target is placed upright, pressing the switch.
2. Player shoots a rubber band at the target.
3. Target jump, releasing the switch.
4. Arduino detects the switch state change and registers a hit.
5. Score is sent to the web frontend and updated.

## Usage

1. Flash the firmware to your Arduino
2. Connect the Arduino to your computer via USB
3. Open the [website](https://mdl29.github.io/emoji-shooter/) in a Chromium browser
4. Connect to the Arduino with the button on top-left
5. Play by shooting at the emoji targets and watch your score update in real time

![alt](/.github/images/shooting.gif)