#!/usr/bin/env python3
"""
Lists the longest and shortest code files in the project.
Threshold can be set to warn about files longer or shorter than a certain number of lines.
"""

import os
import argparse
from pathlib import Path
from typing import List, Tuple

# File extensions to consider as code files
CODE_EXTENSIONS = {
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  # TypeScript/JavaScript
    '.swift',  # macOS/iOS
    '.kt', '.java',  # Android
    '.py', '.sh',  # Scripts
}

# Directories to skip
SKIP_DIRS = {
    'node_modules', '.git', 'dist', 'build', 'coverage',
    '__pycache__', '.turbo', 'out', '.worktrees', 'vendor',
    'Pods', 'DerivedData', '.gradle', '.idea'
}

# Filename patterns to skip in short-file warnings (barrel exports, stubs)
SKIP_SHORT_PATTERNS = {
    'index.js', 'index.ts', 'postinstall.js',
}
SKIP_SHORT_SUFFIXES = ('-cli.ts',)

# Known packages in the monorepo
PACKAGES = {
    'src', 'apps', 'extensions', 'packages', 'scripts', 'ui', 'test', 'docs'
}


def get_package(file_path: Path, root_dir: Path) -> str:
    """Get the package name for a file, or 'root' if at top level."""
    try:
        relative = file_path.relative_to(root_dir)
        parts = relative.parts
        if len(parts) > 0 and parts[0] in PACKAGES:
            return parts[0]
        return 'root'
    except ValueError:
        return 'root'


def count_lines(file_path: Path) -> int:
    """Count the number of lines in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except Exception:
        return 0


def find_code_files(root_dir: Path) -> List[Tuple[Path, int]]:
    """Find all code files and their line counts."""
    files_with_counts = []
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Remove skip directories from dirnames to prevent walking into them
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        
        for filename in filenames:
            file_path = Path(dirpath) / filename
            if file_path.suffix.lower() in CODE_EXTENSIONS:
                line_count = count_lines(file_path)
                files_with_counts.append((file_path, line_count))
    
    return files_with_counts


def main():
    parser = argparse.ArgumentParser(
        description='List the longest and shortest code files in a project'
    )
    parser.add_argument(
        '-t', '--threshold',
        type=int,
        default=1000,
        help='Warn about files longer than this many lines (default: 1000)'
    )
    parser.add_argument(
        '--min-threshold',
        type=int,
        default=10,
        help='Warn about files shorter than this many lines (default: 10)'
    )
    parser.add_argument(
        '-n', '--top',
        type=int,
        default=20,
        help='Show top N longest files (default: 20)'
    )
    parser.add_argument(
        '-b', '--bottom',
        type=int,
        default=10,
        help='Show bottom N shortest files (default: 10)'
    )
    parser.add_argument(
        '-d', '--directory',
        type=str,
        default='.',
        help='Directory to scan (default: current directory)'
    )
    
    args = parser.parse_args()
    
    root_dir = Path(args.directory).resolve()
    print(f"\n📂 Scanning: {root_dir}\n")
    
    # Find and sort files by line count
    files = find_code_files(root_dir)
    files_desc = sorted(files, key=lambda x: x[1], reverse=True)
    files_asc = sorted(files, key=lambda x: x[1])
    
    # Show top N longest files
    top_files = files_desc[:args.top]
    
    print(f"📊 Top {min(args.top, len(top_files))} longest code files:\n")
    print(f"{'Lines':>8}  {'File'}")
    print("-" * 60)
    
    long_warnings = []
    
    for file_path, line_count in top_files:
        relative_path = file_path.relative_to(root_dir)
        
        # Check if over threshold
        if line_count >= args.threshold:
            marker = " ⚠️"
            long_warnings.append((relative_path, line_count))
        else:
            marker = ""
        
        print(f"{line_count:>8}  {relative_path}{marker}")
    
    # Show bottom N shortest files
    bottom_files = files_asc[:args.bottom]
    
    print(f"\n📉 Bottom {min(args.bottom, len(bottom_files))} shortest code files:\n")
    print(f"{'Lines':>8}  {'File'}")
    print("-" * 60)
    
    short_warnings = []
    
    for file_path, line_count in bottom_files:
        relative_path = file_path.relative_to(root_dir)
        filename = file_path.name
        
        # Skip known barrel exports and stubs
        is_expected_short = (
            filename in SKIP_SHORT_PATTERNS or
            any(filename.endswith(suffix) for suffix in SKIP_SHORT_SUFFIXES)
        )
        
        # Check if under threshold
        if line_count <= args.min_threshold and not is_expected_short:
            marker = " ⚠️"
            short_warnings.append((relative_path, line_count))
        else:
            marker = ""
        
        print(f"{line_count:>8}  {relative_path}{marker}")
    
    # Summary
    total_files = len(files)
    total_lines = sum(count for _, count in files)
    
    print("-" * 60)
    print(f"\n📈 Summary:")
    print(f"   Total code files: {total_files:,}")
    print(f"   Total lines: {total_lines:,}")
    print(f"   Average lines/file: {total_lines // total_files if total_files else 0:,}")
    
    # Per-package breakdown
    package_stats: dict[str, dict] = {}
    for file_path, line_count in files:
        pkg = get_package(file_path, root_dir)
        if pkg not in package_stats:
            package_stats[pkg] = {'files': 0, 'lines': 0}
        package_stats[pkg]['files'] += 1
        package_stats[pkg]['lines'] += line_count
    
    print(f"\n📦 Per-package breakdown:\n")
    print(f"{'Package':<15} {'Files':>8} {'Lines':>10} {'Avg':>8}")
    print("-" * 45)
    
    for pkg in sorted(package_stats.keys(), key=lambda p: package_stats[p]['lines'], reverse=True):
        stats = package_stats[pkg]
        avg = stats['lines'] // stats['files'] if stats['files'] else 0
        print(f"{pkg:<15} {stats['files']:>8,} {stats['lines']:>10,} {avg:>8,}")
    
    # Long file warnings
    if long_warnings:
        print(f"\n⚠️  Warning: {len(long_warnings)} file(s) exceed {args.threshold} lines (consider refactoring):")
        for path, count in long_warnings:
            print(f"   - {path} ({count:,} lines)")
    else:
        print(f"\n✅ No files exceed {args.threshold} lines")
    
    # Short file warnings
    if short_warnings:
        print(f"\n⚠️  Warning: {len(short_warnings)} file(s) are {args.min_threshold} lines or less (check if needed):")
        for path, count in short_warnings:
            print(f"   - {path} ({count} lines)")
    else:
        print(f"\n✅ No files are {args.min_threshold} lines or less")
    
    print()


if __name__ == '__main__':
    main()
