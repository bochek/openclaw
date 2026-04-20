#!/usr/bin/env python3
"""
Vision Pipeline for Video Transcription + Description
============================================
Combines:
- yt-dlp (YouTube download)
- ffmpeg (frame extraction)  
- Ollama vision models (frame description)
- Faster Whisper (transcription)

Usage:
    python video_pipeline.py <youtube_url> [output_dir]
    
Example:
    python video_pipeline.py "https://youtu.be/GnoJaaIHXWU" "C:\temp\video_output"
"""
import os
import sys
import json
import time
import shutil
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.vision_client import describe_image, extract_video_frames, DEFAULT_MODEL

# Constants
DEFAULT_MODEL = "minicpm-v"  # Fast, good quality
TRANSCRIPT_MODEL = "qwen3.5:9b"  # Local Ollama for transcription
WHISPER_API = "http://localhost:8001/asr"

# Token tracking (simulated - LiteLLM writes real data)
TOTAL_TOKENS_IN = 0
TOTAL_TOKENS_OUT = 0


def get_video_info(url: str) -> Dict[str, Any]:
    """Get video metadata via yt-dlp"""
    cmd = [
        "python", "-m", "yt_dlp",
        "--dump-json",
        "--no-download",
        "--no-playlist",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp error: {result.stderr[:200]}")
    
    data = json.loads(result.stdout)
    return {
        'title': data.get('title', 'Unknown'),
        'duration': data.get('duration', 0),
        'url': url,
        'id': data.get('display_id', 'unknown')
    }


def download_video(url: str, output_path: str) -> str:
    """Download YouTube video (no audio track) for frame extraction"""
    video_template = str(Path(output_path) / "video.%(ext)s")
    cmd = [
        "python", "-m", "yt_dlp",
        "-f", "best[height<=720]",
        "-o", video_template,
        "--no-playlist",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Download error: {result.stderr[:300]}")
    
    # Find downloaded video file
    files = list(Path(output_path).glob("video.*"))
    if not files:
        raise RuntimeError("No video file found after download")
    
    return str(files[0])


def download_audio(url: str, output_path: str) -> str:
    """Download YouTube audio as MP3"""
    audio_template = str(Path(output_path) / "audio.%(ext)s")
    cmd = [
        "python", "-m", "yt_dlp",
        "-x", "--audio-format", "mp3",
        "-o", audio_template,
        "--no-playlist",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Download error: {result.stderr[:200]}")
    
    # Find the downloaded file
    files = list(Path(output_path).glob("audio.*"))
    if not files:
        raise RuntimeError("No audio file found after download")
    
    return str(files[0])


def transcribe_audio(audio_path: str) -> Dict[str, Any]:
    """Transcribe audio using Faster Whisper API"""
    import requests
    
    with open(audio_path, 'rb') as f:
        files = {'file': ('audio.mp3', f, 'audio/mpeg')}
        data = {'model': 'base', 'language': 'en'}
        
        start = time.time()
        response = requests.post(WHISPER_API, files=files, data=data, timeout=300)
        elapsed = time.time() - start
    
    if response.status_code != 200:
        raise RuntimeError(f"Whisper error: {response.status_code}")
    
    result = response.json()
    
    return {
        'text': result.get('text', ''),
        'segments': result.get('segments', []),
        'language': result.get('language', 'en'),
        'duration': result.get('duration', 0),
        'elapsed': elapsed
    }


def describe_video_frames(video_path: str, model: str = DEFAULT_MODEL,
                         fps: int = 1, max_frames: int = 20) -> Dict[str, Any]:
    """
    Extract frames from video and describe them with vision model
    Returns frame descriptions with timestamps
    """
    frames_dir = str(Path(video_path).parent / "temp_frames")
    
    # Extract frames
    frame_files = extract_video_frames(video_path, frames_dir, fps, max_frames)
    
    if not frame_files:
        return {"error": "No frames extracted", "frames": []}
    
    descriptions = []
    total_frame_time = 0
    
    print(f"  Extracted {len(frame_files)} frames, describing with {model}...")
    
    for i, frame_path in enumerate(frame_files):
        timestamp = i / fps
        try:
            desc, elapsed = describe_image(frame_path, model)
            descriptions.append({
                'frame': i + 1,
                'time': f"{timestamp:.1f}s",
                'seconds': timestamp,
                'description': desc,
                'processing_time': elapsed
            })
            total_frame_time += elapsed
            
            if (i + 1) % 5 == 0:
                print(f"    Frame {i+1}/{len(frame_files)} done ({elapsed:.1f}s)")
                
        except Exception as e:
            descriptions.append({
                'frame': i + 1,
                'time': f"{timestamp:.1f}s",
                'seconds': timestamp,
                'error': str(e)
            })
    
    # Cleanup
    for f in Path(frames_dir).glob("*.jpg"):
        f.unlink()
    Path(frames_dir).rmdir()
    
    return {
        'frames': descriptions,
        'model': model,
        'total_frames': len(frame_files),
        'total_time': total_frame_time,
        'avg_time_per_frame': total_frame_time / len(frame_files) if frame_files else 0
    }


def generate_report(video_info: Dict, transcription: Dict, frame_desc: Dict) -> str:
    """Generate markdown report"""
    report = f"""# Video Transcription Report

## Video Info
- **URL:** {video_info['url']}
- **Title:** {video_info['title']}
- **Duration:** {video_info['duration']:.0f}s ({video_info['duration']/60:.1f} min)

---

## 🎬 Visual Summary (from frames)

| Time | Description |
|------|--------------|
"""
    
    for frame in frame_desc.get('frames', []):
        if 'description' in frame:
            report += f"| {frame['time']} | {frame['description']} |\n"
    
    report += f"""
**Frames processed:** {frame_desc.get('total_frames', 0)}
**Vision model:** {frame_desc.get('model', 'unknown')}
**Avg time/frame:** {frame_desc.get('avg_time_per_frame', 0):.1f}s

---

## 📝 Full Transcription

"""
    
    if transcription.get('text'):
        report += f"{transcription['text']}\n\n"
        report += f"*Transcribed in {transcription.get('elapsed', 0):.1f}s*\n"
    else:
        report += "_No transcription available_\n"
    
    report += f"""

---

## 📊 Token Usage

| Task | Tokens (est.) |
|------|---------------|
| Frame descriptions ({frame_desc.get('total_frames', 0)} frames) | ~{frame_desc.get('total_frames', 0) * 150} |
| Transcription | ~{int(transcription.get('duration', 0) * 30)} |
| **Total** | **~{frame_desc.get('total_frames', 0) * 150 + int(transcription.get('duration', 0) * 30)}** |

---

_Report generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}_
"""
    
    return report


def run_pipeline(url: str, output_dir: str = None, 
                 include_transcription: bool = True,
                 include_frames: bool = True,
                 frame_fps: int = 1,
                 max_frames: int = 20) -> Dict[str, Any]:
    """
    Full video pipeline:
    1. Get video info
    2. Download audio
    3. Transcribe (optional)
    4. Extract + describe frames (optional)
    5. Generate report
    
    Returns dict with all results and token estimates
    """
    global TOTAL_TOKENS_IN, TOTAL_TOKENS_OUT
    
    start_total = time.time()
    video_id = url.split('/')[-1].split('?')[0]
    
    # Default output dir
    if not output_dir:
        output_dir = str(Path(__file__).parent.parent / "media" / "inbound")
    
    output_path = Path(output_dir) / f"video_{video_id}"
    output_path.mkdir(parents=True, exist_ok=True)
    
    results = {
        'url': url,
        'video_id': video_id,
        'output_dir': str(output_path),
        'timestamp': datetime.now().isoformat(),
        'stages': {}
    }
    
    print("=" * 60)
    print(f"VIDEO PIPELINE: {url}")
    print("=" * 60)
    
    # Stage 1: Get video info
    print("\n[1/4] Getting video info...")
    video_info = get_video_info(url)
    results['video_info'] = video_info
    print(f"  Title: {video_info['title']}")
    print(f"  Duration: {video_info['duration']:.0f}s")
    TOTAL_TOKENS_IN += 50  # Simple API call
    
    # Stage 2: Download video (for frames) + audio (for transcription)
    print("\n[2/4] Downloading video + audio...")
    video_path = download_video(url, str(output_path))
    audio_path = download_audio(url, str(output_path))
    results['video_path'] = video_path
    results['audio_path'] = audio_path
    print(f"  Video: {Path(video_path).name}")
    print(f"  Audio: {Path(audio_path).name}")
    TOTAL_TOKENS_IN += 100
    
    # Stage 3: Transcription (optional)
    if include_transcription:
        print("\n[3/4] Transcribing audio...")
        transcription = transcribe_audio(audio_path)
        results['transcription'] = transcription
        print(f"  Duration: {transcription.get('duration', 0):.0f}s")
        print(f"  Text length: {len(transcription.get('text', ''))} chars")
        # Estimate tokens: ~30 tokens per second of audio
        est_tokens = int(transcription.get('duration', 0) * 30)
        TOTAL_TOKENS_IN += est_tokens
        TOTAL_TOKENS_OUT += est_tokens // 2
    else:
        print("\n[3/4] Skipping transcription (disabled)")
        transcription = {'text': '', 'duration': 0}
    
    # Stage 4: Frame extraction + description
    if include_frames:
        print("\n[4/4] Extracting + describing frames...")
        frame_desc = describe_video_frames(results['video_path'], 
                                          model=DEFAULT_MODEL,
                                          fps=frame_fps, 
                                          max_frames=max_frames)
        results['frame_descriptions'] = frame_desc
        # Estimate: 150 tokens per frame description
        frame_tokens = frame_desc.get('total_frames', 0) * 150
        TOTAL_TOKENS_IN += frame_tokens
        TOTAL_TOKENS_OUT += frame_tokens // 4
    else:
        print("\n[4/4] Skipping frame description (disabled)")
        frame_desc = {'frames': [], 'total_frames': 0}
    
    # Generate report
    print("\n[REPORT] Generating markdown report...")
    report = generate_report(video_info, transcription, frame_desc)
    report_path = output_path / "report.md"
    report_path.write_text(report, encoding='utf-8')
    print(f"  Saved: {report_path}")
    
    # Archive to TurboVec
    try:
        from memory_archiver import MemoryArchiver, ARCHIVE_INDEX_DIR
        import turbovec
        
        # Load or create archive
        archive_path = ARCHIVE_INDEX_DIR / "memory_archive"
        if archive_path.exists():
            archiver = MemoryArchiver.load(str(archive_path))
        else:
            archiver = MemoryArchiver()
        
        # Read report and index
        report_text = report_path.read_text(encoding='utf-8')
        archiver.add_entry(
            text=report_text[:4000],  # Truncate for embedding
            source=str(report_path),
            entry_type="video_report",
            metadata={
                "video_id": video_info['id'],
                "title": video_info['title'],
                "duration": video_info['duration']
            }
        )
        archiver.prepare()
        archiver.save(str(archive_path))
        print(f"  [TURBOVEC] Archived: {len(archiver)} total entries ({archiver.compression_ratio:.1f}x compression)")
    except Exception as e:
        print(f"  [TURBOVEC] Warning: Archive failed: {e}")
    
    # Cleanup temp files
    print("\n[CLEANUP] Removing temp files...")
    for f in output_path.glob("temp_*"):
        if f.is_dir():
            shutil.rmtree(f)
    
    total_time = time.time() - start_total
    
    results['report_path'] = str(report_path)
    results['total_time'] = total_time
    results['token_stats'] = {
        'est_tokens_in': TOTAL_TOKENS_IN,
        'est_tokens_out': TOTAL_TOKENS_OUT,
        'model': 'minimax-m2.7 (OpenRouter) + qwen3.5:9b (Ollama)'
    }
    
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"Total time: {total_time:.1f}s")
    print(f"Est tokens IN: {TOTAL_TOKENS_IN:,}")
    print(f"Est tokens OUT: {TOTAL_TOKENS_OUT:,}")
    print(f"Report: {report_path}")
    
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        results = run_pipeline(url, output_dir)
        print("\n[OK] SUCCESS")
        print(f"Report: {results['report_path']}")
    except Exception as e:
        print(f"\n[X] ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)