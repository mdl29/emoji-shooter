# emji_target/config.py

# Serial communication settings (Adjust COM_PORT as needed for your system)
# For Linux, it might be '/dev/ttyUSB0' or '/dev/ttyACM0'
# For macOS, '/dev/cu.usbserial-XXXX' or '/dev/cu.usbmodemXXXX'
# For Windows, 'COM3', 'COM4', etc.
SERIAL_PORT = '/dev/ttyACM0'  # <--- IMPORTANT: Change this to your Arduino's port
BAUD_RATE = 9600
NUM_TARGETS = 5  # Should match the Arduino's NUM_TARGETS

# Defines the sequence of emotions/GIFs and the correct target for each round.
# 'emotion_gif': Path to the GIF in the static/gifs/ folder.
# 'emotion_name': Name of the emotion displayed.
# 'correct_target_id': The ID (0-4) of the physical target that is correct for this emotion.
# 'rain_emoji': The emoji used for the "correct hit" rain effect.
GAME_ROUNDS = [
    #{'emotion_gif': 'gifs/happy.gif', 'emotion_name': 'Happy', 'correct_target_id': 0, 'rain_emoji': '😄'},
    {'emotion_gif': 'gifs/sad.gif', 'emotion_name': 'Sad', 'correct_target_id': 1, 'rain_emoji': '😢'},
    #{'emotion_gif': 'gifs/angry.gif', 'emotion_name': 'Angry', 'correct_target_id': 2, 'rain_emoji': '😠'},
    {'emotion_gif': 'gifs/surprised.gif', 'emotion_name': 'Surprised', 'correct_target_id': 2, 'rain_emoji': '😮'},
    {'emotion_gif': 'gifs/love.gif', 'emotion_name': 'Love', 'correct_target_id': 0, 'rain_emoji': '❤️'},
    # Add more rounds as desired
]

# Describes the emoji associated with each physical target ID (0 to NUM_TARGETS-1).
# This helps the player understand which physical target represents which emoji/concept.
# The 'emoji' is what will be displayed on the web page as a legend for the physical targets.
PHYSICAL_TARGET_DEFINITIONS = {
    0: {'id': 0, 'emoji': '😄', 'label': 'Target "Happy"'},
    1: {'id': 1, 'emoji': '😢', 'label': 'Target "Sad"'},
    2: {'id': 2, 'emoji': '😠', 'label': 'Target "Angry"'},
    3: {'id': 3, 'emoji': '😮', 'label': 'Target "Surprised"'},
    4: {'id': 4, 'emoji': '❤️', 'label': 'Target "Love"'},
}

# Emojis for the "incorrect hit" rain effect
LOSE_EMOJI_RAIN_OPTIONS = ['😭', '💔', '💥', '👎', '🤦']

# Placeholder GIF if a specific one isn't found
DEFAULT_GIF = 'gifs/placeholder.gif'