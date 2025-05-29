# emji_target/game_manager.py
import random
from queue import Queue, Empty
from . import config # Assuming config.py is in the same directory or package

class GameManager:
    def __init__(self):
        self.score = 0
        self.current_round_index = -1
        self.current_round_data = None
        self.game_over = False
        self.event_queue = Queue() # For SSE messages
        # Ensure target definitions cover all expected IDs
        self.target_emojis_on_display = {
            i: config.PHYSICAL_TARGET_DEFINITIONS.get(i, {'id': i, 'emoji': '❓', 'label': f'Target {i}'})
            for i in range(config.NUM_TARGETS)
        }
        self.start_new_game()

    def start_new_game(self):
        self.score = 0
        self.current_round_index = -1
        self.game_over = False
        # Clear any pending events from previous game
        while not self.event_queue.empty():
            try:
                self.event_queue.get_nowait()
            except Empty:
                continue
        self.next_round()
        print("New game started. Initial state broadcasted.")

    def next_round(self):
        self.current_round_index += 1
        if self.current_round_index < len(config.GAME_ROUNDS):
            self.current_round_data = config.GAME_ROUNDS[self.current_round_index]
            self.game_over = False
            self._broadcast_state_update("new_round")
            print(f"Advanced to round {self.current_round_index + 1}: {self.current_round_data['emotion_name']}")
        else:
            self.game_over = True
            self._broadcast_state_update("game_over")
            print("Game over. Final score:", self.score)

    def process_hit(self, hit_target_id):
        if self.game_over or not self.current_round_data:
            print(f"Hit processed on target {hit_target_id} but game is over or not ready. No action.")
            return

        is_correct = (hit_target_id == self.current_round_data['correct_target_id'])
        rain_trigger_emoji = ""

        if is_correct:
            self.score += 1
            rain_trigger_emoji = self.current_round_data['rain_emoji']
            print(f"Correct hit on target {hit_target_id}! Score: {self.score}")
        else:
            self.score -= 1
            rain_trigger_emoji = random.choice(config.LOSE_EMOJI_RAIN_OPTIONS)
            print(f"Incorrect hit on target {hit_target_id}. Score: {self.score}")

        self._broadcast_hit_result(is_correct, rain_trigger_emoji)
        self.next_round() # Automatically advance to the next round after a hit

    def _broadcast_hit_result(self, is_correct, rain_emoji):
        event_data = {
            'type': 'hit_evaluation',
            'correct': is_correct,
            'rain_emoji': rain_emoji,
            'score': self.score,
        }
        self.event_queue.put(event_data)

    def _broadcast_state_update(self, event_type="state_update"):
        state = {'type': event_type, 'score': self.score}
        if self.game_over:
            state['message'] = "Game Over!"
        elif self.current_round_data:
            state.update({
                'current_emotion_gif': self.current_round_data.get('emotion_gif', config.DEFAULT_GIF),
                'current_emotion_name': self.current_round_data.get('emotion_name', 'Unknown Emotion'),
                'round_number': self.current_round_index + 1,
                'total_rounds': len(config.GAME_ROUNDS),
            })
        else: # Should only happen if GAME_ROUNDS is empty initially
            state['type'] = 'initial_empty'
            state['message'] = "Game not configured or finished."
            state['current_emotion_gif'] = config.DEFAULT_GIF
            state['current_emotion_name'] = "Waiting for game to start"
            state['round_number'] = 0
            state['total_rounds'] = len(config.GAME_ROUNDS)

        self.event_queue.put(state)

    def get_current_state_for_html(self):
        # For initial page load
        if self.game_over:
            return {
                'game_over': True,
                'score': self.score,
                'target_definitions': self.target_emojis_on_display,
                'message': "Game Over! Press Reset to play again."
            }
        
        current_gif = config.DEFAULT_GIF
        current_name = "Loading..."
        round_num = self.current_round_index +1
        total_r = len(config.GAME_ROUNDS)

        if self.current_round_data:
            current_gif = self.current_round_data.get('emotion_gif', config.DEFAULT_GIF)
            current_name = self.current_round_data.get('emotion_name', 'Unknown Emotion')
        elif config.GAME_ROUNDS: # If game hasn't started but rounds exist
            current_gif = config.GAME_ROUNDS[0].get('emotion_gif', config.DEFAULT_GIF)
            current_name = config.GAME_ROUNDS[0].get('emotion_name', 'Ready?')
            round_num = 0 # Indicates not started
        
        return {
            'game_over': False,
            'score': self.score,
            'current_emotion_gif': current_gif,
            'current_emotion_name': current_name,
            'round_number': round_num,
            'total_rounds': total_r,
            'target_definitions': self.target_emojis_on_display
        }

    def get_event_queue(self):
        return self.event_queue

# Global instance of the game manager
game = GameManager()