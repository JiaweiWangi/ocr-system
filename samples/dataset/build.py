"""Build a deterministic synthetic OCR baseline; no OCR or network requests."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from functools import lru_cache
from pathlib import Path

import PIL
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
CATEGORIES = {
    "photo_document": ("拍照文档", "general", (1200, 1600)),
    "table_screenshot": ("表格截图", "table", (1400, 980)),
    "receipt": ("票据单据", "table", (1200, 1160)),
    "exam": ("试卷图片", "deep", (1200, 1600)),
    "poster": ("宣传海报", "general", (1000, 1400)),
    "scan": ("扫描件", "general", (1200, 1600)),
}
CHALLENGES = ["rotation", "low_contrast", "blur", "downscale", "jpeg_noise"]
FONT_PATH: Path
BOLD_PATH: Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@lru_cache(maxsize=None)
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(BOLD_PATH if bold else FONT_PATH), size)


class Page:
    def __init__(self, case: dict):
        self.case = case
        self.width, self.height = CATEGORIES[case["category"]][2]
        self.image = Image.new("RGB", (self.width, self.height), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.y = 64
        self.margin = 70
        self.segments: list[dict] = []
        self.tables: list[dict] = []

    def wrap(self, text: str, size: int, width: int, bold: bool = False) -> list[str]:
        lines, line = [], ""
        for char in text:
            if self.draw.textlength(line + char, font=font(size, bold)) > width:
                assert line, f"Character cannot fit: {self.case['id']}"
                lines.append(line)
                line = char
            else:
                line += char
        return lines + [line] if line else lines

    def check_space(self, height: int) -> None:
        assert self.y + height <= self.height - 65, f"Content overflow: {self.case['id']}"

    def text(self, text: str, size: int = 32, bold: bool = False,
             role: str = "paragraph", color: str = "#202020", centered: bool = False,
             gap: int = 18) -> None:
        lines = self.wrap(text, size, self.width - 2 * self.margin, bold)
        self.check_space(len(lines) * (size + 14) + gap)
        for line in lines:
            x = self.margin
            if centered:
                x = (self.width - self.draw.textlength(line, font=font(size, bold))) / 2
            self.draw.text((x, self.y), line, font=font(size, bold), fill=color, anchor="lt")
            self.y += size + 14
        self.y += gap
        self.segments.append({"order": len(self.segments), "role": role, "text": text})

    def table(self, source: dict, size: int = 28) -> None:
        headers, rows = source["headers"], source["rows"]
        ncols = len(headers)
        width = self.width - 2 * self.margin
        col_width = width // ncols
        expected_cells = []
        for row_index, row in enumerate([headers] + rows):
            assert len(row) == ncols
            lines = [self.wrap(value, size, col_width - 28, row_index == 0) for value in row]
            row_height = max(max(map(len, lines)), 1) * (size + 10) + 30
            self.check_space(row_height)
            for col_index, cell_lines in enumerate(lines):
                left = self.margin + col_index * col_width
                right = self.margin + (col_index + 1) * col_width
                self.draw.rectangle((left, self.y, right, self.y + row_height),
                                    fill="#edf0f2" if row_index == 0 else "white",
                                    outline="#747c82", width=2)
                for line_index, line in enumerate(cell_lines):
                    line_width = self.draw.textlength(line, font=font(size, row_index == 0))
                    self.draw.text((left + (col_width - line_width) / 2,
                                    self.y + 15 + line_index * (size + 10)), line,
                                   font=font(size, row_index == 0), fill="#171717", anchor="lt")
                expected_cells.append({"row": row_index, "column": col_index, "text": row[col_index]})
            self.segments.append({"order": len(self.segments), "role": "table_row", "text": "\t".join(row)})
            self.y += row_height
        self.y += 28
        self.tables.append({"rows": len(rows) + 1, "columns": ncols, "cells": expected_cells})


def render(case: dict) -> Page:
    page = Page(case)
    page.text(f"合成测试样本  {case['id']}", size=22, color="#555555", role="sample_label", gap=28)
    category = case["category"]
    if category == "poster":
        palette = ["#176b54", "#a2343d", "#25637a", "#6b4f86", "#24684a"]
        accent = palette[int(case["id"].split("-")[-1]) - 1]
        page.draw.rectangle((page.margin, page.y, page.width - page.margin, page.y + 9), fill=accent)
        page.y += 54
        page.text(case["title"], size=80, bold=True, color=accent, role="title", gap=48)
        for index, paragraph in enumerate(case["paragraphs"]):
            page.text(paragraph, size=36 if index == 0 else 30,
                      bold=index == 0, gap=38 if index == 0 else 26)
    else:
        page.text(case["title"], size=44, bold=True, centered=True, role="title", gap=40)
        body = [] if category == "table_screenshot" else case.get("paragraphs", [])
        for paragraph in body:
            page.text(paragraph, size=32, gap=24)
        if "table" in case:
            page.table(case["table"])
        tail = case.get("paragraphs", []) if category == "table_screenshot" else case.get("after", [])
        for paragraph in tail:
            page.text(paragraph, size=28, gap=20)
    return page


def standard_image(page: Page) -> tuple[Image.Image, list[dict]]:
    image = page.image
    if page.case["category"] == "photo_document":
        paper = image.rotate(-1.2, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="#e0e0dd")
        canvas = Image.new("RGB", (paper.width + 120, paper.height + 120), "#cbd1ce")
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rectangle((68, 70, paper.width + 68, paper.height + 70), fill=(0, 0, 0, 75))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(14))).convert("RGB")
        canvas.paste(paper, (50, 50))
        return canvas, [{"operation": "simulated_camera_frame", "rotation_degrees": -1.2}]
    if page.case["category"] == "scan":
        return ImageOps.grayscale(image).convert("RGB"), [{"operation": "simulated_grayscale_scan"}]
    return image, []


def challenge_image(image: Image.Image, challenge: str, seed: int) -> tuple[Image.Image, dict]:
    if challenge == "rotation":
        return image.rotate(2.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="#eeeeee"), {
            "operation": "rotation", "degrees": 2.5, "expand": True}
    if challenge == "low_contrast":
        image = ImageEnhance.Contrast(image).enhance(0.55)
        return ImageEnhance.Brightness(image).enhance(0.9), {
            "operation": "low_contrast", "contrast_factor": 0.55, "brightness_factor": 0.9}
    if challenge == "blur":
        return image.filter(ImageFilter.GaussianBlur(0.9)), {"operation": "gaussian_blur", "radius": 0.9}
    if challenge == "downscale":
        return image.resize((round(image.width * 0.6), round(image.height * 0.6)), Image.Resampling.LANCZOS), {
            "operation": "downscale", "factor": 0.6}
    rng = random.Random(seed)
    size = (max(1, image.width // 4), max(1, image.height // 4))
    noise = Image.frombytes("L", size, bytes(rng.randrange(225, 256) for _ in range(size[0] * size[1])))
    image = ImageChops.multiply(image, noise.resize(image.size, Image.Resampling.BILINEAR).convert("RGB"))
    return image, {"operation": "jpeg_noise", "noise_range": [225, 255], "seed": seed, "jpeg_quality": 42}


def find_font(explicit: str | None, candidates: list[str]) -> Path:
    for item in [explicit, *candidates]:
        if item and Path(item).is_file():
            return Path(item)
    raise SystemExit("No CJK font found. Pass --font and --bold-font with local CJK font paths.")


def build(output: Path) -> None:
    source_path = ROOT / "cases.json"
    cases = json.loads(source_path.read_text(encoding="utf-8"))["cases"]
    records = []
    for case in cases:
        case_id, category = case["id"], case["category"]
        number = int(case_id.split("-")[-1])
        split = "test" if number == 5 else "development"
        page = render(case)
        text_rel = f"ground_truth/{category}/{case_id}.txt"
        annotation_rel = f"annotations/{category}/{case_id}.json"
        text_path = output / text_rel
        text_path.parent.mkdir(parents=True, exist_ok=True)
        text_path.write_text("\n".join(segment["text"] for segment in page.segments) + "\n", encoding="utf-8")
        write_json(output / annotation_rel, {
            "schema_version": 1, "case_id": case_id,
            "origin": "synthetic", "annotation_method": "renderer_source_text",
            "reading_order": "top_to_bottom_then_table_row_major",
            "segments": page.segments, "tables": page.tables,
            "coordinates_available": False,
            "review_status": "generated_not_independently_transcribed",
        })
        standard, standard_ops = standard_image(page)
        challenge = CHALLENGES[number - 1]
        seed = int(hashlib.sha256(case_id.encode()).hexdigest()[:8], 16)
        degraded, operation = challenge_image(standard.copy(), challenge, seed)
        for variant, image, operations in [
            ("standard", standard, standard_ops),
            ("challenge", degraded, standard_ops + [operation]),
        ]:
            jpeg = variant == "challenge" or category == "photo_document"
            extension = "jpg" if jpeg else "png"
            sample_id = f"{case_id}-{variant}"
            image_rel = f"images/{category}/{sample_id}.{extension}"
            image_path = output / image_rel
            image_path.parent.mkdir(parents=True, exist_ok=True)
            quality = 42 if variant == "challenge" and challenge == "jpeg_noise" else 88
            if jpeg:
                image.save(image_path, quality=quality, subsampling=0)
            else:
                image.save(image_path, optimize=True)
            records.append({
                "id": sample_id, "case_id": case_id, "category": category,
                "category_label": CATEGORIES[category][0], "title": case["title"],
                "variant": variant, "split": split, "origin": "synthetic",
                "source": "cases.json", "source_case_id": case_id,
                "image": image_rel, "ground_truth": text_rel, "annotation": annotation_rel,
                "width": image.width, "height": image.height,
                "format": "JPEG" if jpeg else "PNG", "bytes": image_path.stat().st_size,
                "sha256": sha256(image_path), "ground_truth_sha256": sha256(text_path),
                "recommended_mode": CATEGORIES[category][1],
                "transforms": operations, "encoding": {"jpeg_quality": quality} if jpeg else {},
                "fixture": None, "ocr_verified": False,
            })
    write_json(output / "manifest.json", {
        "schema_version": 1, "name": "ocr-subtopic1-synthetic-baseline-v1",
        "description": "30 independent synthetic cases, each with standard and challenge images. No real photographs or scanner captures.",
        "independent_cases": len(cases), "image_count": len(records),
        "generator": {"script": "build.py", "sha256": sha256(Path(__file__)),
                      "pillow_version": PIL.__version__, "content_sha256": sha256(source_path),
                      "font": {"name": FONT_PATH.name, "sha256": sha256(FONT_PATH)},
                      "bold_font": {"name": BOLD_PATH.name, "sha256": sha256(BOLD_PATH)}},
        "samples": records,
    })
    catalog = ["# 基准样本索引", "", "全部为合成样本；同一内容的两个版本不计为两个独立案例。", "",
               "| 编号 | 类别 | 内容 | 划分 | 推荐模式 | 标准图 | 扰动图 | 标准文本 |",
               "|---|---|---|---|---|---|---|---|"]
    for case in cases:
        samples = [sample for sample in records if sample["case_id"] == case["id"]]
        a, b = samples
        catalog.append(f"| {a['case_id']} | {a['category_label']} | {a['title']} | {a['split']} | {a['recommended_mode']} | [图片]({a['image']}) | [图片]({b['image']}) | [文本]({a['ground_truth']}) |")
    (output / "CATALOG.md").write_text("\n".join(catalog) + "\n", encoding="utf-8")
    print(f"Built {len(cases)} independent synthetic cases / {len(records)} images in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font")
    parser.add_argument("--bold-font")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    args = parser.parse_args()
    FONT_PATH = find_font(args.font, [
        "/Applications/Microsoft Word.app/Contents/Resources/DFonts/Simsun.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ])
    BOLD_PATH = find_font(args.bold_font, [
        "/Applications/Microsoft Word.app/Contents/Resources/DFonts/SimHei.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
    ])
    build(args.output_dir.resolve())
