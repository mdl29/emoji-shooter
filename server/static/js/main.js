// static/js/main.js
document.addEventListener('DOMContentLoaded', function () {
    const scoreEl = document.getElementById('score');
    const emotionGifEl = document.getElementById('emotion-gif');
    const emotionNameEl = document.getElementById('emotion-name');
    const roundNumberEl = document.getElementById('round-number');
    const totalRoundsEl = document.getElementById('total-rounds');
    const instructionsEl = document.getElementById('instructions');
    const gameOverMessageEl = document.getElementById('game-over-message');
    const finalScoreEl = document.getElementById('final-score');
    const gifDisplayEl = document.getElementById('gif-display');
    const resetButton = document.getElementById('reset-button');

    const emojiRainContainer = document.getElementById('emoji-rain-container');

    function updateUI(data) {
        if (data.score !== undefined) {
            scoreEl.textContent = data.score;
        }
        if (data.current_emotion_gif) {
            emotionGifEl.src = `/static/${data.current_emotion_gif}`; // Make sure Flask's url_for is used for initial, JS needs full path or relative to static
        }
        if (data.current_emotion_name) {
            emotionNameEl.textContent = data.current_emotion_name;
        }
        if (data.round_number !== undefined) {
            roundNumberEl.textContent = data.round_number;
        }
        if (data.total_rounds !== undefined) {
            totalRoundsEl.textContent = data.total_rounds;
        }
    }

    function triggerEmojiRain(emoji, count = 30) {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.classList.add('emoji-particle');
            particle.textContent = emoji;
            particle.style.left = `${Math.random() * 100}vw`;
            particle.style.fontSize = `${1.5 + Math.random() * 1.5}rem`; // Random size
            
            const duration = 2 + Math.random() * 3; // Fall duration 2-5 seconds
            particle.style.animationDuration = `${duration}s`;
            particle.style.animationDelay = `${Math.random() * 0.5}s`; // Stagger start times

            emojiRainContainer.appendChild(particle);

            // Remove particle after animation
            particle.addEventListener('animationend', () => {
                particle.remove();
            });
        }
    }

    function handleGameState(data) {
        console.log("SSE Received:", data); // For debugging

        if (data.type === 'new_round' || data.type === 'initial_empty') {
            updateUI(data);
            gifDisplayEl.style.display = 'block';
            gameOverMessageEl.style.display = 'none';
            instructionsEl.textContent = "Look at the GIF! Hit the physical target that matches the emotion.";
            resetButton.textContent = "Reset Game";
        } else if (data.type === 'hit_evaluation') {
            scoreEl.textContent = data.score; // Update score immediately
            triggerEmojiRain(data.rain_emoji, data.correct ? 40 : 25); // More emojis for correct
        } else if (data.type === 'game_over') {
            updateUI(data); // Update final score if included
            gifDisplayEl.style.display = 'none';
            gameOverMessageEl.style.display = 'block';
            finalScoreEl.textContent = data.score;
            instructionsEl.textContent = "Game Over! Press 'Play Again?' to start a new game.";
            resetButton.textContent = "Play Again?";
        } else if (data.type === 'state_update') { // Generic state update
             updateUI(data);
        }
    }
    
    // Initialize EventSource
    const eventSource = new EventSource("/events");

    eventSource.onmessage = function (event) {
        // Check for keepalive messages
        if (event.data === ": keepalive") {
            console.log("Keepalive received");
            return;
        }
        try {
            const data = JSON.parse(event.data);
            handleGameState(data);
        } catch (error) {
            console.error("Error parsing SSE data:", error, "Data:", event.data);
        }
    };

    eventSource.onerror = function (err) {
        console.error("EventSource failed:", err);
        // Optionally, you can try to reconnect or inform the user
        // eventSource.close(); // Close and potentially re-initialize after a delay
    };

    // Ensure the reset button works as a POST for consistency if needed,
    // but a GET redirect from Flask is simpler for this button.
    // The form submission will handle the GET request to /reset.
    // No extra JS needed for reset button if Flask handles redirect.
});