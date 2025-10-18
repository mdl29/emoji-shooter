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
        digitalWrite(led, state() ? LOW : HIGH);
    }

    void emit() {
      // Run every cycle
      // Change led state depending on input
      
      bool curState = state();
      if (curState != lastState) {
        lastState = curState;

        //printState();
        updateLED();

        if (curState == HIGH) {
          printId();
          delay(500);
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
  
  for (auto& target : targets) {
    target.init();
  }
}

void loop() {
  for (auto& target : targets) {
    target.emit();
  }
}
