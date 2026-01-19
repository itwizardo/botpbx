#!/usr/bin/env python3
"""
Kokoro TTS Server for NovaPBX
A simple HTTP server that accepts TTS requests and returns WAV audio.
"""

import os
import sys
import json
import tempfile
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Lazy load kokoro to avoid slow startup
kokoro_pipeline = None

def get_kokoro():
    """Lazy initialization of Kokoro pipeline."""
    global kokoro_pipeline
    if kokoro_pipeline is None:
        logger.info("Loading Kokoro TTS model (first request)...")
        try:
            from kokoro_onnx import Kokoro
            kokoro_pipeline = Kokoro(
                "kokoro-v1.0.onnx",  # Model file
                "voices-v1.0.bin"    # Voices file
            )
            logger.info("Kokoro TTS model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Kokoro model: {e}")
            logger.info("Attempting to download Kokoro model...")
            try:
                # Download model if not present
                import urllib.request
                model_dir = os.path.dirname(os.path.abspath(__file__))

                model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
                voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

                model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
                voices_path = os.path.join(model_dir, "voices-v1.0.bin")

                if not os.path.exists(model_path):
                    logger.info(f"Downloading Kokoro model to {model_path}...")
                    urllib.request.urlretrieve(model_url, model_path)
                    logger.info("Kokoro model downloaded")

                if not os.path.exists(voices_path):
                    logger.info(f"Downloading Kokoro voices to {voices_path}...")
                    urllib.request.urlretrieve(voices_url, voices_path)
                    logger.info("Kokoro voices downloaded")

                from kokoro_onnx import Kokoro
                kokoro_pipeline = Kokoro(model_path, voices_path)
                logger.info("Kokoro TTS model loaded successfully after download")
            except Exception as e2:
                logger.error(f"Failed to download/load Kokoro model: {e2}")
                raise
    return kokoro_pipeline

class TTSHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logger.info(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        """Health check endpoint."""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "engine": "kokoro"}).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        """Handle TTS synthesis request."""
        if self.path != '/synthesize':
            self.send_response(404)
            self.end_headers()
            return

        try:
            # Parse request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            text = data.get('text', '')
            voice = data.get('voice', 'af_heart')  # Default voice
            output_path = data.get('output_path')

            if not text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No text provided"}).encode())
                return

            logger.info(f"Synthesizing: '{text[:50]}...' with voice '{voice}'")

            # Get Kokoro pipeline
            kokoro = get_kokoro()

            # Generate audio
            samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0)

            # Save to file
            import soundfile as sf

            if output_path:
                sf.write(output_path, samples, sample_rate)
                logger.info(f"Audio saved to {output_path}")

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "output_path": output_path,
                    "sample_rate": sample_rate,
                    "duration": len(samples) / sample_rate
                }).encode())
            else:
                # Return audio directly
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    sf.write(f.name, samples, sample_rate)
                    f.seek(0)
                    audio_data = open(f.name, 'rb').read()
                    os.unlink(f.name)

                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', len(audio_data))
                self.end_headers()
                self.wfile.write(audio_data)

        except Exception as e:
            logger.error(f"TTS error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

def main():
    port = int(os.environ.get('KOKORO_PORT', 5003))
    server_address = ('127.0.0.1', port)

    httpd = HTTPServer(server_address, TTSHandler)
    logger.info(f"Kokoro TTS server starting on port {port}")
    logger.info("Model will be loaded on first request...")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        httpd.shutdown()

if __name__ == '__main__':
    main()
