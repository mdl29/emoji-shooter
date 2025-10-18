# Testing LED Blink Feature

## Feature Description
When the character 'f' is sent to the Arduino via serial communication, all LEDs will blink in sync:
- All LEDs turn HIGH for 100ms
- All LEDs turn LOW for 100ms
- LEDs return to their normal state (based on target switch states)

## Testing Methods

### Method 1: Using Arduino IDE Serial Monitor
1. Upload the sketch to your Arduino board
2. Open Tools > Serial Monitor in Arduino IDE
3. Set the baud rate to 9600
4. Type 'f' in the input field and click Send
5. Observe all LEDs blinking in sync (HIGH 100ms, LOW 100ms)

### Method 2: Using Serial Terminal (Linux/Mac)
```bash
# Find your Arduino port
ls /dev/tty*

# Send 'f' command
echo "f" > /dev/ttyACM0  # Replace with your actual port
```

### Method 3: Using Python
```python
import serial
import time

# Open serial connection
ser = serial.Serial('/dev/ttyACM0', 9600)  # Replace with your port
time.sleep(2)  # Wait for Arduino to reset

# Send 'f' command
ser.write(b'f')

# Close connection
ser.close()
```

## Expected Behavior
- All 6 LEDs (pins 8-13) should turn ON simultaneously
- After 100ms, all LEDs should turn OFF simultaneously
- After another 100ms, each LED returns to its normal state (reflecting the target switch state)
- The entire sequence takes 200ms
- Normal target detection continues to work after the blink

## Integration with Game
The frontend application can be enhanced to send the 'f' command when the game finishes (all targets hit). This would require adding serial write capability to the JavaScript code.
