# emji_target/serial_listener.py
import serial
import threading
import time
import config # Assuming config.py is in the same directory or package
from game_manager import game # Import the global game instance

def listen_to_arduino():
    ser = None
    print("Serial listener thread started.")
    while True:
        try:
            if ser is None or not ser.is_open:
                print(f"Attempting to connect to Arduino on {config.SERIAL_PORT} at {config.BAUD_RATE} baud.")
                ser = serial.Serial(config.SERIAL_PORT, config.BAUD_RATE, timeout=1)
                print(f"Successfully connected to Arduino on {config.SERIAL_PORT}.")
                # Send a ready message or wait for Arduino's ready message if implemented
                # ser.write(b"SERVER_READY\n") # Optional: if Arduino expects it
                time.sleep(2) # Give Arduino time to initialize after connection

            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').rstrip()
                print(f"Arduino raw: {line}") # Debug raw input
                if line.startswith("TARGET_HIT:"):
                    try:
                        target_id_str = line.split(":")[1]
                        target_id = int(target_id_str)
                        if 0 <= target_id < config.NUM_TARGETS:
                            print(f"Parsed TARGET_HIT: ID={target_id}")
                            game.process_hit(target_id) # Call game manager method
                        else:
                            print(f"Error: Received invalid target_id: {target_id}")
                    except (IndexError, ValueError) as e:
                        print(f"Error parsing Arduino message '{line}': {e}")
                # Optional: Handle other messages from Arduino if any
                # elif line == "Arduino ready. Waiting for target hits...":
                #    print("Arduino confirmed ready.")

        except serial.SerialException as e:
            print(f"Serial connection error on {config.SERIAL_PORT}: {e}. Retrying in 5 seconds...")
            if ser and ser.is_open:
                ser.close()
            ser = None # Reset ser object to trigger reconnection attempt
            time.sleep(5)
        except Exception as e:
            print(f"Unexpected error in serial listener: {e}. Retrying in 5 seconds...")
            if ser and ser.is_open:
                ser.close()
            ser = None
            time.sleep(5)
        time.sleep(0.01) # Brief pause to prevent high CPU usage

def start_serial_listener_thread():
    thread = threading.Thread(target=listen_to_arduino, daemon=True)
    thread.start()
    print("Serial listener thread initiated.")
