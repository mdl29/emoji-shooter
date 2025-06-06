# emji_target/app.py
from flask import Flask, render_template, Response, request, redirect, url_for
import json
import time
from queue import Empty

#from . import config # Local import
import config # Local import
from game_manager import game # Import the global game instance from game_manager
from serial_listener import start_serial_listener_thread

app = Flask(__name__)
app.config['SECRET_KEY'] = 'votre_cle_secrete_ici_tres_importante' # Change this!

def event_stream():
    """Generator for Server-Sent Events."""
    try:
        while True:
            try:
                # Wait for a new event from the game manager's queue
                # Timeout helps to periodically check if client is still connected
                event_data = game.get_event_queue().get(timeout=1)
                # print(f"SSE sending: {event_data}") # Debug SSE
                yield f"data: {json.dumps(event_data)}\n\n"
                game.get_event_queue().task_done()
            except Empty:
                # Send a comment to keep the connection alive if no real events
                yield ": keepalive\n\n"
            except Exception as e:
                # print(f"Error in event_stream: {e}") # Log errors
                # Potentially break or handle specific errors if needed
                pass # Continue trying
            time.sleep(0.05) # Small delay to manage loop frequency
    except GeneratorExit:
        print("Client disconnected from SSE stream.")
    finally:
        print("SSE stream closed.")


@app.route('/')
def index():
    initial_state = game.get_current_state_for_html()
    return render_template('index.html', initial_state=initial_state, project_name="emji target")

@app.route('/events')
def sse_events():
    return Response(event_stream(), mimetype='text/event-stream')

@app.route('/reset', methods=['POST', 'GET']) # Allow GET for simple link reset
def reset_game():
    print("Reset request received.")
    game.start_new_game()
    # The new game state will be pushed via SSE.
    # Redirecting to index ensures the page reloads with a fresh base state if JS fails.
    return redirect(url_for('index'))

# It's good practice to run the serial listener start from within the app context
# but only once.
if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    print("Starting serial listener thread from app context.")
    start_serial_listener_thread()

if __name__ == '__main__':
    # DO NOT use `debug=True` in production with the threaded serial listener
    # as Werkzeug reloader might start it twice or manage threads poorly.
    # For development, it's often fine, but be aware.
    # Consider using a production-ready WSGI server like Gunicorn or Waitress.
    print("Starting Flask app.")
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=False) # debug=False for stable threading
