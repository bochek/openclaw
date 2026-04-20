#!/usr/bin/env python3
"""
Vision Client - Image/Video description via Ollama
Uses minicpm-v (fast, 5.5GB) as primary, llava:7b (detailed, 4.7GB) as fallback

TurboVec Integration:
- Stores frame embeddings with 8x compression
- Semantic search over video frames
- 100% local, no external dependencies
"""
import base64
import io
import json
import os
import time
import subprocess
import requests
import numpy as np
from pathlib import Path
from typing import Optional, List, Dict, Any

# TurboVec for compressed vector storage
try:
    import turbovec
    TURBOVEC_AVAILABLE = True
except ImportError:
    TURBOVEC_AVAILABLE = False
    print("[WARNING] turbovec not installed. Run: pip install turbovec")

# Config
DEFAULT_MODEL = "minicpm-v"  # Fast, good quality
FALLBACK_MODEL = "llava:7b"  # More detailed descriptions
OLLAMA_API = "http://localhost:11434/api/chat"
OLLAMA_EMBED = "http://localhost:11434/api/embeddings"
MAX_IMAGE_SIZE_MB = 20


def load_image_as_base64(image_path: str) -> str:
    """Load image and convert to base64"""
    path = Path(image_path)
    if path.stat().st_size > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise ValueError(f"Image too large: {path.stat().st_size / 1024 / 1024:.1f}MB (max {MAX_IMAGE_SIZE_MB}MB)")
    
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def describe_image(image_path: str, model: str = DEFAULT_MODEL, 
                   prompt: str = "Describe this image in 2-3 sentences. Be specific about objects, colors, and actions.") -> str:
    """
    Describe an image using Ollama vision model
    
    Args:
        image_path: Path to image file
        model: Ollama model name (default: minicpm-v)
        prompt: Custom prompt override
    
    Returns:
        Text description of the image
    """
    img_data = load_image_as_base64(image_path)
    
    payload = {
        'model': model,
        'stream': False,
        'messages': [{
            'role': 'user',
            'content': prompt,
            'images': [img_data]
        }]
    }
    
    start_time = time.time()
    response = requests.post(OLLAMA_API, json=payload, timeout=120)
    elapsed = time.time() - start_time
    
    if response.status_code != 200:
        raise RuntimeError(f"Ollama error: {response.status_code} - {response.text[:200]}")
    
    result = response.json()
    content = result.get('message', {}).get('content', '')
    
    if not content:
        raise ValueError("Empty response from model")
    
    return content, elapsed


def describe_image_stream(image_path: str, model: str = DEFAULT_MODEL,
                         prompt: str = "Describe this image briefly") -> tuple:
    """
    Stream image description from Ollama (yields chunks)
    
    Returns:
        Generator yielding (text_chunk, done_flag, elapsed_time)
    """
    img_data = load_image_as_base64(image_path)
    start_time = time.time()
    
    payload = {
        'model': model,
        'stream': True,
        'messages': [{
            'role': 'user',
            'content': prompt,
            'images': [img_data]
        }]
    }
    
    response = requests.post(OLLAMA_API, json=payload, stream=True, timeout=120)
    
    if response.status_code != 200:
        raise RuntimeError(f"Ollama error: {response.status_code}")
    
    full_text = ""
    
    for line in response.iter_lines():
        if line:
            try:
                data = json.loads(line)
                if 'message' in data:
                    chunk = data['message'].get('content', '')
                    full_text += chunk
                    yield chunk, False, 0  # streaming, no elapsed yet
                elif 'done' in data:
                    elapsed = time.time() - start_time
                    yield "", True, elapsed
                    break
            except json.JSONDecodeError:
                continue


def extract_video_frames(video_path: str, output_dir: str, 
                        fps: int = 1, max_frames: int = 30) -> List[str]:
    """
    Extract frames from video using ffmpeg
    
    Args:
        video_path: Path to video file
        output_dir: Directory to save frames
        fps: Frames per second to extract
        max_frames: Maximum frames to extract
    
    Returns:
        List of frame file paths
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Clean up existing frames
    for f in output_path.glob("frame_*.jpg"):
        f.unlink()
    
    # Extract frames
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps},scale=1024:-1",
        "-vframes", str(max_frames),
        "-q:v", "2",
        str(output_path / "frame_%04d.jpg"),
        "-y"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg error: {result.stderr[:200]}")
    
    frames = sorted(output_path.glob("frame_*.jpg"))
    return [str(f) for f in frames]


def get_embedding(text: str, model: str = "nomic-embed-text:latest") -> np.ndarray:
    """
    Get text embedding via Ollama
    
    Args:
        text: Text to embed
        model: Ollama embedding model
    
    Returns:
        numpy array of embeddings
    """
    payload = {"model": model, "prompt": text}
    response = requests.post(OLLAMA_EMBED, json=payload, timeout=60)
    
    if response.status_code != 200:
        raise RuntimeError(f"Embedding error: {response.status_code}")
    
    result = response.json()
    embedding = result.get('embedding', [])
    
    if not embedding:
        raise ValueError("Empty embedding response")
    
    return np.array(embedding, dtype=np.float32)



class VideoFrameIndex:
    """
    Compressed vector index for video frames using TurboVec
    
    Provides 8x compression for frame embeddings with fast semantic search.
    100% local, no external dependencies.
    """
    
    def __init__(self, dim: int = 768, bit_width: int = 4):
        """
        Initialize video frame index
        
        Args:
            dim: Embedding dimension (default 768 for nomic/qwen)
            bit_width: Compression bits (4 = 8x, 2 = 16x)
        """
        if not TURBOVEC_AVAILABLE:
            raise ImportError("turbovec not installed. Run: pip install turbovec")
        
        self.dim = dim
        self.bit_width = bit_width
        self.index = turbovec.TurboQuantIndex(dim=dim, bit_width=bit_width)
        self.frames = []  # Store frame metadata
        self.initialized = False
    
    def add_frame(self, frame_path: str, description: str, embedding: np.ndarray = None):
        """
        Add frame to index
        
        Args:
            frame_path: Path to frame image
            description: Frame description text
            embedding: Optional pre-computed embedding
        """
        if embedding is None:
            embedding = get_embedding(description)
        
        if len(embedding) != self.dim:
            raise ValueError(f"Embedding dim mismatch: {len(embedding)} vs {self.dim}")
        
        self.index.add(embedding.reshape(1, -1))
        self.frames.append({
            'path': frame_path,
            'description': description,
            'index': len(self.frames)
        })
    
    def prepare(self):
        """Prepare index for search (call before searching)"""
        if not self.frames:
            return
        self.index.prepare()
        self.initialized = True
    
    def search(self, query: str, k: int = 5) -> List[Dict]:
        """
        Semantic search over frames
        
        Args:
            query: Search query text
            k: Number of results to return
        
        Returns:
            List of matching frames with scores
        """
        if not self.initialized:
            self.prepare()
        
        if not self.frames:
            return []
        
        query_emb = get_embedding(query).reshape(1, -1)
        results = self.index.search(query_emb, k=min(k, len(self.frames)))
        
        # Parse results
        indices = results[1][0]  # indices of matching frames
        
        matches = []
        for idx in indices:
            if idx < len(self.frames):
                matches.append(self.frames[idx])
        
        return matches
    
    def save(self, path: str):
        """Save index to disk"""
        self.index.write(path)
    
    @classmethod
    def load(cls, path: str, dim: int = 768, bit_width: int = 4) -> 'VideoFrameIndex':
        """Load index from disk"""
        idx = cls(dim=dim, bit_width=bit_width)
        idx.index = turbovec.TurboQuantIndex.load(path)
        idx.initialized = True
        return idx
    
    def __len__(self):
        return len(self.frames)
    
    @property
    def compression_ratio(self) -> float:
        """Actual compression ratio achieved"""
        if not self.frames:
            return 0
        original = len(self.frames) * self.dim * 4  # float32
        compressed = (len(self.frames) * self.dim * self.bit_width) // 8
        return original / compressed if compressed > 0 else 0


def describe_video_frames(video_path: str, model: str = DEFAULT_MODEL,
                          fps: int = 1, max_frames: int = 10,
                          overall_prompt: str = None) -> Dict[str, Any]:
    """
    Extract frames from video and describe them
    
    Args:
        video_path: Path to video file
        model: Ollama model
        fps: Frames per second to extract
        max_frames: Max frames to describe
        overall_prompt: Optional prompt for overall video description
    
    Returns:
        Dict with frame descriptions and video summary
    """
    frames_dir = str(Path(video_path).parent / "temp_frames")
    
    # Extract frames
    frame_files = extract_video_frames(video_path, frames_dir, fps, max_frames)
    
    if not frame_files:
        return {"error": "No frames extracted", "frames": []}
    
    # Describe each frame
    descriptions = []
    for i, frame_path in enumerate(frame_files):
        try:
            desc, elapsed = describe_image(frame_path, model)
            descriptions.append({
                'frame': i + 1,
                'timestamp': f"{i/fps:.1f}s",
                'description': desc,
                'time': elapsed
            })
        except Exception as e:
            descriptions.append({
                'frame': i + 1,
                'timestamp': f"{i/fps:.1f}s",
                'error': str(e)
            })
    
    # Cleanup temp frames
    for f in Path(frames_dir).glob("*.jpg"):
        f.unlink()
    Path(frames_dir).rmdir()
    
    return {
        'frames': descriptions,
        'model': model,
        'total_frames': len(frame_files)
    }


def quick_vision_test(model: str = DEFAULT_MODEL) -> bool:
    """Quick test that the vision model works"""
    try:
        from PIL import Image
        import numpy as np
        
        # Create simple test image
        arr = (np.random.rand(100, 100, 3) * 255).astype('uint8')
        img = Image.fromarray(arr, 'RGB')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        img_b64 = base64.b64encode(buf.getvalue()).decode()
        
        payload = {
            'model': model,
            'stream': False,
            'messages': [{
                'role': 'user',
                'content': 'Describe this image in 3 words',
                'images': [img_b64]
            }]
        }
        
        r = requests.post(OLLAMA_API, json=payload, timeout=30)
        if r.status_code == 200:
            return True
        return False
    except:
        return False


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python vision_client.py <image_path> [model]")
        print(f"Default model: {DEFAULT_MODEL}")
        sys.exit(1)
    
    image_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MODEL
    
    print(f"Using model: {model}")
    print(f"Image: {image_path}")
    print("-" * 50)
    
    try:
        desc, elapsed = describe_image(image_path, model)
        print(f"Description ({elapsed:.1f}s):")
        print(desc)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)