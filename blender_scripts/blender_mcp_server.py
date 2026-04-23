import os
import subprocess
import json
from flask import Flask, request, jsonify

app = Flask(__name__)

BLENDER_PATH = os.environ.get("BLENDER_PATH", "blender")
RENDER_OUTPUT = os.environ.get("RENDER_OUTPUT", "/renders")

@app.route("/execute", methods=["POST"])
def execute_blender():
    """Execute a python script inside Blender"""
    data = request.json
    script_content = data.get("script")
    
    script_path = os.path.join("/tmp", "blender_script.py")
    with open(script_path, "w") as f:
        f.write(script_content)
    
    try:
        # Run blender in background mode with the script
        result = subprocess.run(
            [BLENDER_PATH, "--background", "--python", script_path],
            capture_output=True, text=True, timeout=60
        )
        return jsonify({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "status": "success" if result.returncode == 0 else "error"
        })
    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "blender-mcp"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9100)
