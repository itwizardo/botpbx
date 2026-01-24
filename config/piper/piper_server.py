#!/usr/bin/env python3
"""
Piper TTS HTTP Server
A simple Flask server wrapping Piper TTS for NovaPBX
"""

from flask import Flask, request, jsonify, send_file
import subprocess
import tempfile
import os
import io
import shlex

app = Flask(__name__)

# Configuration
VOICES_DIR = os.environ.get('VOICES_DIR', '/opt/novapbx/tts-server/voices')
DEFAULT_VOICE = 'en_US-lessac-medium'

def get_voice_metadata():
    """Get metadata about installed voices from their JSON files"""
    voices = {}
    if os.path.exists(VOICES_DIR):
        for f in os.listdir(VOICES_DIR):
            if f.endswith('.onnx'):
                voice_name = f.replace('.onnx', '')
                json_path = os.path.join(VOICES_DIR, f'{voice_name}.onnx.json')
                meta = {'name': voice_name}

                # Try to parse metadata
                if os.path.exists(json_path):
                    try:
                        import json
                        with open(json_path, 'r') as jf:
                            data = json.load(jf)
                            meta['sample_rate'] = data.get('audio', {}).get('sample_rate', 22050)
                            meta['language'] = data.get('language', {}).get('code', 'en')
                    except:
                        meta['sample_rate'] = 22050
                        meta['language'] = 'en'
                else:
                    meta['sample_rate'] = 22050
                    meta['language'] = 'en'

                voices[voice_name] = meta
    return voices

@app.route('/generate', methods=['POST'])
def generate():
    """Generate TTS audio from text

    Request body:
        {
            "text": "Hello world",
            "voice": "en_US-lessac-medium" (optional)
        }

    Returns: WAV audio (8kHz mono for Asterisk compatibility)
    """
    data = request.json
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    voice_name = data.get('voice', DEFAULT_VOICE)

    # Validate voice exists
    model_path = os.path.join(VOICES_DIR, f'{voice_name}.onnx')
    json_path = os.path.join(VOICES_DIR, f'{voice_name}.onnx.json')

    if not os.path.exists(model_path):
        return jsonify({"error": f"Voice not found: {voice_name}"}), 404

    try:
        # Create temp file for output
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp_path = tmp.name

        # Generate audio using piper CLI
        # Piper outputs raw audio, we pipe through sox to convert to 8kHz WAV for Asterisk
        piper_cmd = [
            'piper',
            '--model', model_path,
            '--config', json_path,
            '--output_file', tmp_path
        ]

        # Run piper with text input
        process = subprocess.run(
            piper_cmd,
            input=text.encode('utf-8'),
            capture_output=True,
            timeout=30
        )

        if process.returncode != 0:
            error_msg = process.stderr.decode('utf-8', errors='ignore')
            return jsonify({"error": f"Piper failed: {error_msg}"}), 500

        # Convert to 8kHz mono WAV for Asterisk (using sox)
        output_path = tmp_path.replace('.wav', '_8k.wav')
        sox_cmd = [
            'sox', tmp_path,
            '-r', '8000',  # 8kHz sample rate
            '-c', '1',     # Mono
            output_path
        ]

        sox_result = subprocess.run(sox_cmd, capture_output=True, timeout=10)

        # Clean up original temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

        if sox_result.returncode != 0:
            # Fall back to original file if sox fails
            output_path = tmp_path

        # Read the output file and return
        with open(output_path, 'rb') as f:
            audio_data = f.read()

        # Clean up
        if os.path.exists(output_path):
            os.unlink(output_path)

        return send_file(
            io.BytesIO(audio_data),
            mimetype='audio/wav',
            as_attachment=True,
            download_name='output.wav'
        )

    except subprocess.TimeoutExpired:
        return jsonify({"error": "TTS generation timed out"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/voices', methods=['GET'])
def list_voices():
    """List all installed voice models

    Returns:
        {
            "voices": [
                {
                    "id": "en_US-lessac-medium",
                    "name": "Lessac (US Female)",
                    "language": "en_US",
                    "gender": "female",
                    "quality": "medium"
                },
                ...
            ]
        }
    """
    voices = []

    if os.path.exists(VOICES_DIR):
        for f in sorted(os.listdir(VOICES_DIR)):
            if f.endswith('.onnx'):
                voice_id = f.replace('.onnx', '')

                # Parse voice info from name (e.g., en_US-lessac-medium)
                parts = voice_id.split('-')
                if len(parts) >= 3:
                    lang = parts[0]
                    name = parts[1]
                    quality = parts[2] if len(parts) > 2 else 'medium'
                else:
                    lang = 'en_US'
                    name = voice_id
                    quality = 'medium'

                # Determine gender from common voice names
                female_names = ['lessac', 'amy', 'kristin', 'kathleen', 'alba', 'cori', 'jenny']
                male_names = ['ryan', 'joe', 'alan', 'aru', 'kusal', 'arctic']

                gender = 'unknown'
                name_lower = name.lower()
                if any(fn in name_lower for fn in female_names) or 'female' in name_lower:
                    gender = 'female'
                elif any(mn in name_lower for mn in male_names) or 'male' in name_lower:
                    gender = 'male'

                # Create display name
                display_name = name.replace('_', ' ').title()
                if gender != 'unknown':
                    gender_symbol = 'F' if gender == 'female' else 'M'
                    display_name = f"{display_name} ({lang} {gender_symbol})"
                else:
                    display_name = f"{display_name} ({lang})"

                voices.append({
                    "id": voice_id,
                    "name": display_name,
                    "language": lang,
                    "gender": gender,
                    "quality": quality
                })

    return jsonify({"voices": voices})

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint

    Returns:
        {
            "status": "ok",
            "voices_count": 10,
            "piper_available": true
        }
    """
    # Check if piper is available
    piper_available = False
    try:
        result = subprocess.run(['piper', '--help'], capture_output=True, timeout=5)
        piper_available = result.returncode == 0
    except:
        pass

    # Count voices
    voices_count = 0
    if os.path.exists(VOICES_DIR):
        voices_count = len([f for f in os.listdir(VOICES_DIR) if f.endswith('.onnx')])

    status = "ok" if piper_available and voices_count > 0 else "degraded"

    return jsonify({
        "status": status,
        "piper_available": piper_available,
        "voices_count": voices_count,
        "voices_dir": VOICES_DIR
    })

@app.route('/test', methods=['GET'])
def test():
    """Test endpoint that generates a sample audio"""
    test_text = request.args.get('text', 'Hello, this is a test of the Piper text to speech system.')
    voice = request.args.get('voice', DEFAULT_VOICE)

    # Use the generate endpoint
    return generate.__wrapped__(text=test_text, voice=voice)

if __name__ == '__main__':
    print(f"Starting Piper TTS Server...")
    print(f"Voices directory: {VOICES_DIR}")

    # Check for voices
    if os.path.exists(VOICES_DIR):
        voice_count = len([f for f in os.listdir(VOICES_DIR) if f.endswith('.onnx')])
        print(f"Found {voice_count} voice models")
    else:
        print(f"Warning: Voices directory does not exist")

    app.run(host='127.0.0.1', port=5050, debug=False)
