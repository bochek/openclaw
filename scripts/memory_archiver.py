#!/usr/bin/env python3
"""
Memory Archiver - TurboVec for Long-term Memory Storage
=======================================================
Indexes .md files (video reports, memory logs, transcriptions) into TurboVec
for semantic search with 8x compression.

Flow:
  scan_md_files() → extract_text() → embed() → TurboVec index → disk
  semantic_search() → embed query → TurboVec → results
"""
import sys
import json
import time
import subprocess
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

# Config
sys.path.insert(0, str(Path(__file__).parent))
from vision_client import get_embedding, TURBOVEC_AVAILABLE

try:
    import turbovec
except ImportError:
    turbovec = None

# Default paths
MEMORY_DIR = Path(r"C:\Users\Bochek\.openclaw\workspace\memory")
MEDIA_DIR = Path(r"C:\Users\Bochek\openclaw\media\inbound")
ARCHIVE_INDEX_DIR = Path(r"C:\Users\Bochek\openclaw\data\turbovec_archive")


class MemoryArchiver:
    """
    Long-term memory indexer using TurboVec
    
    Stores embeddings from:
    - Video reports (media/inbound/video_*/report.md)
    - Memory logs (memory/YYYY-MM-DD.md)
    - Any .md files in specified directories
    """
    
    def __init__(self, dim: int = 768, bit_width: int = 4):
        if not TURBOVEC_AVAILABLE:
            raise ImportError("turbovec not installed. Run: pip install turbovec")
        
        self.dim = dim
        self.bit_width = bit_width
        self.index = turbovec.TurboQuantIndex(dim=dim, bit_width=bit_width)
        self.entries = []  # Metadata for each entry
        self.initialized = False
    
    def add_entry(self, text: str, source: str, entry_type: str = "doc",
                  metadata: Dict = None) -> int:
        """
        Add entry to archive
        
        Args:
            text: Text content to embed
            source: File path or source identifier
            entry_type: Type of entry (video_report, memory_log, etc)
            metadata: Additional metadata
        
        Returns:
            Entry index
        """
        # Get embedding
        embedding = get_embedding(text)
        
        if len(embedding) != self.dim:
            raise ValueError(f"Embedding dim mismatch: {len(embedding)} vs {self.dim}")
        
        # Add to index
        self.index.add(embedding.reshape(1, -1))
        
        # Store metadata
        entry = {
            "index": len(self.entries),
            "text": text[:500],  # Store first 500 chars for display
            "source": source,
            "type": entry_type,
            "timestamp": datetime.now().isoformat(),
            "text_len": len(text),
            "metadata": metadata or {}
        }
        self.entries.append(entry)
        
        return len(self.entries) - 1
    
    def prepare(self):
        """Prepare index for search"""
        if self.entries:
            self.index.prepare()
            self.initialized = True
    
    def search(self, query: str, k: int = 5, entry_type: str = None) -> List[Dict]:
        """
        Semantic search over archived entries
        
        Args:
            query: Search query text
            k: Number of results
            entry_type: Filter by type (optional)
        
        Returns:
            List of matching entries with scores
        """
        if not self.initialized:
            self.prepare()
        
        if not self.entries:
            return []
        
        # Get query embedding
        query_emb = get_embedding(query).reshape(1, -1)
        
        # Search
        results = self.index.search(query_emb, k=min(k, len(self.entries)))
        indices = results[1][0]
        
        # Build response
        matches = []
        for idx in indices:
            if idx < len(self.entries):
                entry = self.entries[idx].copy()
                # Don't include full text in results (too large)
                if "text" in entry:
                    entry["text_preview"] = entry.pop("text", "")[:200]
                matches.append(entry)
        
        # Filter by type if specified
        if entry_type:
            matches = [m for m in matches if m.get("type") == entry_type]
        
        return matches
    
    def save(self, path: str = None):
        """Save index and metadata to disk"""
        if path is None:
            ARCHIVE_INDEX_DIR.mkdir(parents=True, exist_ok=True)
            path = str(ARCHIVE_INDEX_DIR / "memory_archive")
        
        # Save TurboVec index
        self.index.write(path)
        
        # Save metadata (JSON)
        meta_path = path + ".meta.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(self.entries, f, indent=2, ensure_ascii=False)
        
        return path
    
    @classmethod
    def load(cls, path: str = None) -> "MemoryArchiver":
        """Load index from disk"""
        if path is None:
            path = str(ARCHIVE_INDEX_DIR / "memory_archive")
        
        idx = cls()
        idx.index = turbovec.TurboQuantIndex.load(path)
        idx.initialized = True
        
        # Load metadata
        meta_path = path + ".meta.json"
        if Path(meta_path).exists():
            with open(meta_path, "r", encoding="utf-8") as f:
                idx.entries = json.load(f)
        
        return idx


    def __len__(self):
        return len(self.entries)
    
    @property
    def compression_ratio(self) -> float:
        """Actual compression ratio achieved"""
        if not self.entries:
            return 0
        total_chars = sum(e.get("text_len", 0) for e in self.entries)
        original = total_chars * 4
        compressed = (len(self.entries) * self.dim * self.bit_width) // 8
        return original / compressed if compressed > 0 else 0


def scan_md_files(directory: Path, pattern: str = "*.md", 
                  max_files: int = 1000) -> List[Path]:
    """Scan directory for .md files"""
    if not directory.exists():
        return []
    
    files = list(directory.glob(pattern))
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files[:max_files]


def extract_text_from_md(path: Path, max_chars: int = 4000) -> str:
    """Extract readable text from markdown file"""
    try:
        content = path.read_text(encoding="utf-8")
        # Skip frontmatter if present
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2]
        
        # Clean markdown (remove headers, links, etc)
        lines = []
        for line in content.split("\n"):
            line = line.strip()
            # Skip headers, links, code blocks
            if line.startswith(("#", "-", "*", "=")) or line.startswith("[") or line.startswith("`"):
                continue
            lines.append(line)
        
        content = " ".join(lines)
        
        # Truncate if too long (Ollama has limits)
        if len(content) > max_chars:
            content = content[:max_chars]
        
        return content.strip()
    except Exception as e:
        return f"Error reading {path}: {e}"


def index_video_reports(archiver: MemoryArchiver, 
                       video_dir: Path = None) -> int:
    """Index all video reports"""
    if video_dir is None:
        video_dir = MEDIA_DIR
    
    count = 0
    video_dirs = [d for d in video_dir.iterdir() if d.is_dir() and d.name.startswith("video_")]
    
    for vdir in sorted(video_dirs, key=lambda p: p.stat().st_mtime, reverse=True):
        report_path = vdir / "report.md"
        if report_path.exists():
            text = extract_text_from_md(report_path)
            if text and not text.startswith("Error"):
                archiver.add_entry(
                    text=text,
                    source=str(report_path),
                    entry_type="video_report",
                    metadata={
                        "video_id": vdir.name,
                        "size_kb": report_path.stat().st_size / 1024
                    }
                )
                count += 1
    
    return count


def index_memory_logs(archiver: MemoryArchiver,
                     memory_dir: Path = None) -> int:
    """Index all memory logs"""
    if memory_dir is None:
        memory_dir = MEMORY_DIR
    
    import re
    count = 0
    md_files = scan_md_files(memory_dir, "*.md")
    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    
    for md_path in md_files:
        # Skip if not a memory log (check filename pattern)
        if not date_pattern.match(md_path.stem):
            continue
        
        text = extract_text_from_md(md_path)
        if text and not text.startswith("Error"):
            archiver.add_entry(
                text=text,
                source=str(md_path),
                entry_type="memory_log",
                metadata={
                    "date": md_path.stem,
                    "size_kb": md_path.stat().st_size / 1024
                }
            )
            count += 1
    
    return count


def build_archive() -> Dict[str, Any]:
    """
    Build complete memory archive from all sources
    
    Returns:
        Dict with stats and archiver
    """
    archiver = MemoryArchiver()
    
    stats = {
        "started_at": datetime.now().isoformat(),
        "video_reports": 0,
        "memory_logs": 0,
        "total_entries": 0,
        "total_text_chars": 0,
        "compression_ratio": 0
    }
    
    # Index video reports
    print("[1/2] Indexing video reports...")
    stats["video_reports"] = index_video_reports(archiver)
    print(f"  Found {stats['video_reports']} video reports")
    
    # Index memory logs
    print("[2/2] Indexing memory logs...")
    stats["memory_logs"] = index_memory_logs(archiver)
    print(f"  Found {stats['memory_logs']} memory logs")
    
    # Prepare index
    archiver.prepare()
    stats["total_entries"] = len(archiver)
    
    # Calculate text stats
    total_chars = sum(e["text_len"] for e in archiver.entries)
    stats["total_text_chars"] = total_chars
    
    # Estimate compression
    original_bytes = total_chars * 4  # rough estimate
    compressed_bytes = (len(archiver) * archiver.dim * archiver.bit_width) // 8
    stats["compression_ratio"] = original_bytes / compressed_bytes if compressed_bytes > 0 else 0
    
    stats["completed_at"] = datetime.now().isoformat()
    
    return {"stats": stats, "archiver": archiver}


def semantic_memory_search(query: str, k: int = 5) -> List[Dict]:
    """
    Search all archived memory semantically
    
    Args:
        query: Search query
        k: Number of results
    
    Returns:
        List of matching entries
    """
    # Load existing archive or build new
    archive_path = ARCHIVE_INDEX_DIR / "memory_archive"
    
    if archive_path.exists():
        archiver = MemoryArchiver.load(str(archive_path))
    else:
        result = build_archive()
        archiver = result["archiver"]
    
    return archiver.search(query, k=k)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Memory Archiver with TurboVec")
    parser.add_argument("--build", action="store_true", help="Build archive from scratch")
    parser.add_argument("--search", type=str, help="Search archive")
    parser.add_argument("--k", type=int, default=5, help="Number of search results")
    parser.add_argument("--stats", action="store_true", help="Show archive stats")
    args = parser.parse_args()
    
    if args.build:
        print("Building memory archive...")
        result = build_archive()
        stats = result["stats"]
        archiver = result["archiver"]
        
        print()
        print("=== Archive Built ===")
        print(f"Video reports: {stats['video_reports']}")
        print(f"Memory logs: {stats['memory_logs']}")
        print(f"Total entries: {stats['total_entries']}")
        print(f"Total text: {stats['total_text_chars']:,} chars")
        print(f"Compression: {stats['compression_ratio']:.1f}x")
        
        path = archiver.save()
        print(f"Saved to: {path}")
    
    elif args.search:
        print(f"Searching for: {args.search}")
        results = semantic_memory_search(args.search, k=args.k)
        
        print(f"\nFound {len(results)} results:")
        for i, r in enumerate(results):
            print(f"\n{i+1}. [{r['type']}] {r.get('source', 'unknown')}")
            print(f"   Preview: {r.get('text_preview', '')[:150]}...")
    
    elif args.stats:
        archive_path = ARCHIVE_INDEX_DIR / "memory_archive"
        if archive_path.exists():
            archiver = MemoryArchiver.load(str(archive_path))
            print(f"Archive loaded: {len(archiver)} entries")
            for entry in archiver.entries[:5]:
                print(f"  - {entry['type']}: {entry['source']}")
        else:
            print("No archive found. Run with --build first.")
    
    else:
        parser.print_help()