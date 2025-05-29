// --- Configuration ---
const int NUM_TARGETS = 5; // Adjust to the number of physical targets

class Target {
public:
    int pin;          // Pin the limit switch is connected to
    int id;           // Unique ID for this target (e.g., 0, 1, 2...)
    bool wasPressed;   // Previous state of the switch

    Target(int inputPin, int targetId) {
        pin = inputPin;
        id = targetId;
        pinMode(pin, INPUT_PULLUP); // Use internal pull-up resistor
        wasPressed = (digitalRead(pin) == LOW); // Initial state (LOW means pressed)
    }

    // Check if the target was hit (switch released)
    bool checkHit() {
        bool isPressedNow = (digitalRead(pin) == LOW);
        bool hit = false;

        if (wasPressed && !isPressedNow) { // Transition from pressed to released
            hit = true;
        }
        wasPressed = isPressedNow;
        return hit;
    }
};

// --- Target Instances ---
// Assign pins and IDs according to your wiring
// Example: Target(pin_number, target_id)
Target targets[] = {
    Target(2, 0), // Target 0 on pin 2
    Target(3, 1), // Target 1 on pin 3
    Target(4, 2), // Target 2 on pin 4
    Target(5, 3), // Target 3 on pin 5
    Target(6, 4)  // Target 4 on pin 6
};
// Ensure NUM_TARGETS matches the size of this array.

void setup() {
    Serial.begin(9600); // Start serial communication
    Serial.println("Arduino ready. Waiting for target hits...");
    pinMode(13, OUTPUT);
    pinMode(12, OUTPUT);
    pinMode(11, OUTPUT);
    
}

void loop() {
    for (int i = 0; i < NUM_TARGETS; i++) {
        if (targets[i].checkHit()) {
            Serial.print("TARGET_HIT:");
            Serial.println(targets[i].id);
        }
    }
    delay(50); // Small delay to debounce and reduce CPU usage
    
    digitalWrite(13, !digitalRead(2));
    digitalWrite(12, !digitalRead(3));
    digitalWrite(11, !digitalRead(4));
  
  
}