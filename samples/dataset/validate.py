"""Validate OCR dataset files, annotations, checksums and case-level splits."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
EXPECTED_CATEGORIES = {"photo_document", "table_screenshot", "receipt", "exam", "poster", "scan"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def member(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    require(not Path(relative).is_absolute() and path.is_relative_to(root), f"Unsafe path: {relative}")
    require(path.is_file(), f"Missing file: {relative}")
    return path


def validate(root: Path) -> None:
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    definitions = json.loads((ROOT / "cases.json").read_text(encoding="utf-8"))["cases"]
    require(digest(ROOT / "cases.json") == manifest["generator"]["content_sha256"], "Source content changed; rebuild the dataset")
    require(digest(ROOT / "build.py") == manifest["generator"]["sha256"], "Generator changed; rebuild the dataset")
    samples = manifest["samples"]
    require(len(samples) == manifest["image_count"] == 60, "Expected 60 images")
    require(len({sample["id"] for sample in samples}) == 60, "Duplicate sample IDs")
    require(len({sample["sha256"] for sample in samples}) == 60, "Duplicate image files")
    counts = Counter(sample["category"] for sample in samples)
    require(set(counts) == EXPECTED_CATEGORIES and set(counts.values()) == {10}, "Expected 10 images in each of six categories")
    groups = defaultdict(list)
    expected_files = {"images": set(), "ground_truth": set(), "annotations": set()}
    for sample in samples:
        key = sample["id"]
        groups[sample["case_id"]].append(sample)
        require(sample["origin"] == "synthetic" and sample["ocr_verified"] is False, f"Unexpected provenance: {key}")
        require(sample["fixture"] is None, f"Synthetic ground truth must not be presented as API output: {key}")
        require(sample["recommended_mode"] in {"general", "table", "deep"}, f"Unknown OCR mode: {key}")
        require(sample["split"] in {"development", "test"}, f"Unknown split: {key}")
        image = member(root, sample["image"])
        text = member(root, sample["ground_truth"])
        annotation = member(root, sample["annotation"])
        expected_files["images"].add(image)
        expected_files["ground_truth"].add(text)
        expected_files["annotations"].add(annotation)
        require(digest(image) == sample["sha256"], f"Image checksum mismatch: {key}")
        require(digest(text) == sample["ground_truth_sha256"], f"Text checksum mismatch: {key}")
        require(image.stat().st_size == sample["bytes"] <= 6 * 1024 * 1024, f"Image exceeds upload limit: {key}")
        with Image.open(image) as im:
            im.verify()
        with Image.open(image) as im:
            require(im.size == (sample["width"], sample["height"]), f"Wrong dimensions: {key}")
            require(im.format == sample["format"] in {"PNG", "JPEG"}, f"Wrong image format: {key}")
            require(min(im.size) >= 320, f"Unexpectedly small image: {key}")
            extrema = ImageOps.grayscale(im).getextrema()
            require(extrema[1] - extrema[0] > 30, f"Blank image: {key}")
        truth = text.read_text(encoding="utf-8")
        require(truth.strip() and "\ufffd" not in truth, f"Invalid reference text: {key}")
        data = json.loads(annotation.read_text(encoding="utf-8"))
        require(data["case_id"] == sample["case_id"], f"Wrong annotation case: {key}")
        require([seg["order"] for seg in data["segments"]] == list(range(len(data["segments"]))), f"Broken reading order: {key}")
        require(truth == "\n".join(seg["text"] for seg in data["segments"]) + "\n", f"Annotation/text disagreement: {key}")
        for table in data["tables"]:
            cells = table["cells"]
            require(len(cells) == table["rows"] * table["columns"], f"Missing table cells: {key}")
            positions = {(cell["row"], cell["column"]) for cell in cells}
            require(positions == {(r, c) for r in range(table["rows"]) for c in range(table["columns"])}, f"Invalid table coordinates: {key}")
    require(len(groups) == manifest["independent_cases"] == 30, "Expected 30 independent cases")
    require(set(groups) == {case["id"] for case in definitions}, "Manifest cases do not match source definitions")
    for case_id, variants in groups.items():
        require(len(variants) == 2 and {v["variant"] for v in variants} == {"standard", "challenge"}, f"Invalid variant pair: {case_id}")
        for field in ["category", "split", "ground_truth", "annotation", "source_case_id", "title"]:
            require(len({variant[field] for variant in variants}) == 1, f"Variant disagreement in {field}: {case_id}")
    split_counts = Counter(variants[0]["split"] for variants in groups.values())
    require(split_counts == {"development": 24, "test": 6}, "Expected 24 development / 6 test cases")
    for category in EXPECTED_CATEGORIES:
        test_cases = [v for v in groups.values() if v[0]["category"] == category and v[0]["split"] == "test"]
        require(len(test_cases) == 1, f"Unbalanced test split: {category}")
    for directory, expected in expected_files.items():
        actual = {p.resolve() for p in (root / directory).rglob("*") if p.is_file()}
        require(actual == expected, f"Unexpected files under {directory}: {actual - expected}")
    print("PASS: 30 independent cases / 60 readable, unique images; six categories balanced.")
    print("PASS: reference text, table annotations, checksums, upload limits and case-level splits.")
    print("No real OCR requests or accuracy claims were made.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", type=Path, default=ROOT)
    args = parser.parse_args()
    validate(args.dataset_dir.resolve())
