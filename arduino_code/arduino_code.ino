class Target {
public:
    int pin;
    int id;
    int led;
    
    bool lastState;

    Target(int inputPin, int targetId, int ledPin) {
        pin = inputPin;
        id = targetId;
        led = ledPin;
    }

    void init() {
        pinMode(led, OUTPUT);
        pinMode(pin, INPUT_PULLUP);

        lastState = digitalRead(pin);
        updateLED();
    }

    bool state() {
        return digitalRead(pin);
    }

    void updateLED() {
        digitalWrite(led, !state());
    }

    void emit() {
      // Run every cycle
      // Change led state depending on input
      
      bool curState = state();
      if (curState != lastState) {
        lastState = curState;

        updateLED();
        printState();

        delay(50);
      }
    }

    void printState() {
      if (lastState) {
        Serial.print("up:");
      } else {
        Serial.print("down:");
      }
      
      Serial.println(id);
    }    
};


Target targets[] = {
  Target(2, 1, 8),
  Target(3, 2, 9),
  Target(4, 3, 10),
  Target(5, 4, 11),
  Target(6, 5, 12),
  Target(7, 6, 13)
};

void blinkAllLEDs() {
  // Blink all LEDs in sync: HIGH 100ms, LOW 100ms for 20 cycles
  for (int cycle = 0; cycle < 20; cycle++) {
    for (auto& target : targets) {
      digitalWrite(target.led, HIGH);
    }
    delay(100);
    
    for (auto& target : targets) {
      digitalWrite(target.led, LOW);
    }
    delay(100);
  }
  
  // Restore LED states based on target states
  for (auto& target : targets) {
    target.updateLED();
  }
}

void setup() {
  Serial.begin(9600);
  Serial.println("debug:starting");
  
  for (auto& target : targets) {
    target.init();
  }
}

void loop() {
  // Check for serial input
  if (Serial.available() > 0) {
    char incomingChar = Serial.read();
    if (incomingChar == 'f') {
      blinkAllLEDs();
      // Clear any remaining characters in the buffer
      while (Serial.available() > 0) {
        Serial.read();
      }
    }
  }
  
  for (auto& target : targets) {
    target.emit();
  }
}
