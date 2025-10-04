class Target {
public:
    int pin;
    int id; // Unique ID, currently used for debugging
    int led;
    
    bool lastState;

    Target(int inputPin, int targetId, int ledPin) {
        pin = inputPin;
        id = targetId;
        led = ledPin;
        lastState = (digitalRead(pin) == HIGH);

        pinMode(led, OUTPUT);
        pinMode(pin, INPUT_PULLUP);
    }

    bool state() {
        return (digitalRead(pin) == HIGH);
    }

    bool emit() {
      // Run every cycle
      // Change led state depending on input
      
      bool curState = state();
      if (curState != lastState) {
        lastState = curState;

        //printState();
        digitalWrite(led, curState ? LOW : HIGH);

        if (curState == HIGH) {
          printId();
        }
      }
    }

    void printId() {
      Serial.println(id);
    }

    void printState() {
      // Logging function
      
      Serial.print(id);
      if (lastState) {
        Serial.println(": HIGH");
      } else {
        Serial.println(": LOW");
      }
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

void setup() {
    Serial.begin(9600);
}

void loop() {
  for (auto& target : targets) {
    target.emit();
  }
  delay(50);
}
