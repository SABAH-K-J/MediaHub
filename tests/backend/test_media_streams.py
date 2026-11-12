"""Tests for media stream inspection, chapters, WebVTT subtitles, and transcode streaming."""

from __future__ import annotations

from pathlib import Path

import pytest
from backend.media_streams import (
    build_transcode_command,
    classify_chapter_category,
    convert_srt_to_vtt,
    parse_ffprobe_media_info,
)
from backend.security import encode_b64_path
from fastapi.testclient import TestClient


def test_classify_chapter_category_rules() -> None:
    assert classify_chapter_category("OP 1") == "intro"
    assert classify_chapter_category("Opening Theme") == "intro"
    assert classify_chapter_category("Intro") == "intro"
    assert classify_chapter_category("Previously On") == "recap"
    assert classify_chapter_category("Episode Recap") == "recap"
    assert classify_chapter_category("ED") == "outro"
    assert classify_chapter_category("Ending") == "outro"
    assert classify_chapter_category("End Credits") == "credits"
    assert classify_chapter_category("Next Episode Preview") == "preview"
    assert classify_chapter_category("Part A - The Harbor") == "main"


def test_parse_ffprobe_media_info_with_sidecar_subtitles(tmp_path: Path) -> None:
    video = tmp_path / "Show.S01E01.mkv"
    video.write_bytes(b"video")
    (tmp_path / "Show.S01E01.en.srt").write_text(
        "1\n00:00:01,000 --> 00:00:03,000\nHi\n", encoding="utf-8"
    )
    (tmp_path / "Show.S01E01.jp.forced.vtt").write_text(
        "WEBVTT\n\n00:01.000 --> 00:02.000\nSign\n", encoding="utf-8"
    )
    (tmp_path / "Unrelated.en.srt").write_text(
        "1\n00:00:01,000 --> 00:00:02,000\nNo\n", encoding="utf-8"
    )

    raw = {
        "format": {"duration": "1420.5"},
        "streams": [
            {
                "index": 0,
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
            },
            {
                "index": 1,
                "codec_type": "audio",
                "codec_name": "aac",
                "channels": 2,
                "channel_layout": "stereo",
                "tags": {"language": "jpn", "title": "Japanese Stereo"},
                "disposition": {"default": 1},
            },
            {
                "index": 2,
                "codec_type": "audio",
                "codec_name": "ac3",
                "channels": 6,
                "channel_layout": "5.1",
                "tags": {"language": "eng", "title": "English Surround"},
                "disposition": {"default": 0},
            },
            {
                "index": 3,
                "codec_type": "subtitle",
                "codec_name": "subrip",
                "tags": {"language": "eng", "title": "English"},
                "disposition": {"default": 1, "forced": 0},
            },
            {
                "index": 4,
                "codec_type": "subtitle",
                "codec_name": "hdmv_pgs_subtitle",
                "tags": {"language": "jpn", "title": "Japanese PGS"},
                "disposition": {"default": 0, "forced": 0},
            },
        ],
        "chapters": [
            {"start_time": "0.0", "end_time": "90.0", "tags": {"title": "Opening"}},
            {"start_time": "90.0", "end_time": "1300.0", "tags": {"title": "Main Story"}},
            {"start_time": "1300.0", "end_time": "1390.0", "tags": {"title": "Ending"}},
            {
                "start_time": "1390.0",
                "end_time": "1420.5",
                "tags": {"title": "Next Episode Preview"},
            },
        ],
    }

    info = parse_ffprobe_media_info(str(video), raw)
    assert info.can_direct_play is False  # .mkv container
    assert info.duration == pytest.approx(1420.5)
    assert len(info.audio_tracks) == 2
    assert info.audio_tracks[0].browser_compatible is True
    assert info.audio_tracks[1].browser_compatible is False
    assert info.audio_tracks[1].audio_index == 1

    # 2 embedded + 2 matching external (excluding Unrelated.en.srt)
    assert len(info.subtitle_tracks) == 4
    assert info.subtitle_tracks[0].id == "emb:0"
    assert info.subtitle_tracks[0].text_based is True
    assert info.subtitle_tracks[1].id == "emb:1"
    assert info.subtitle_tracks[1].text_based is False
    ext_ids = {t.id for t in info.subtitle_tracks if t.source == "external"}
    assert ext_ids == {"ext:Show.S01E01.en.srt", "ext:Show.S01E01.jp.forced.vtt"}

    assert [c.category for c in info.chapters] == ["intro", "main", "outro", "preview"]


def test_convert_srt_to_vtt_and_transcode_command() -> None:
    srt = "1\r\n00:01:02,345 --> 00:01:05,678\r\nHello world!\r\n"
    vtt = convert_srt_to_vtt(srt)
    assert vtt.startswith("WEBVTT\n\n")
    assert "00:01:02.345 --> 00:01:05.678" in vtt

    cmd_h264 = build_transcode_command(
        "ffmpeg", "/media/ep.mkv", audio_index=1, start_sec=42.5, video_codec="h264"
    )
    assert "-ss" in cmd_h264 and "42.500" in cmd_h264
    assert "0:a:1?" in cmd_h264
    assert "-c:v" in cmd_h264 and "copy" in cmd_h264

    cmd_hevc = build_transcode_command(
        "ffmpeg", "/media/ep.mkv", audio_index=0, start_sec=0.0, video_codec="hevc"
    )
    assert "libx264" in cmd_hevc


def test_media_info_subtitles_preferences_and_security(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    outside = isolated_env["outside_dir"]

    video = media_root / "Episode01.mp4"
    video.write_bytes(b"mp4-bytes")
    (media_root / "Episode01.en.srt").write_text(
        "1\n00:00:00,500 --> 00:00:02,500\nWelcome\n",
        encoding="utf-8",
    )
    (outside / "secret.mp4").write_bytes(b"secret")

    client.post("/api/roots", json={"path": str(media_root)})

    # Security: outside root rejected with 403
    outside_b64 = encode_b64_path(str(outside / "secret.mp4"))
    assert client.get("/api/media/info", params={"path": outside_b64}).status_code == 403
    sub_res = client.get("/api/subtitles", params={"path": outside_b64, "id": "ext:a.srt"})
    assert sub_res.status_code == 403
    assert client.get("/api/stream/transcode", params={"path": outside_b64}).status_code == 403

    video_b64 = encode_b64_path(str(video))

    # Save track preferences
    pref_res = client.post(
        "/api/file/preferences",
        json={
            "file_path": video_b64,
            "preferred_audio_index": 1,
            "preferred_subtitle_id": "ext:Episode01.en.srt",
        },
    )
    assert pref_res.status_code == 200
    assert pref_res.json()["preferred_audio_index"] == 1
    assert pref_res.json()["preferred_subtitle_id"] == "ext:Episode01.en.srt"

    info_res = client.get("/api/media/info", params={"path": video_b64})
    assert info_res.status_code == 200
    info_data = info_res.json()
    assert info_data["preferred_audio_index"] == 1
    assert info_data["preferred_subtitle_id"] == "ext:Episode01.en.srt"
    assert len(info_data["subtitle_tracks"]) == 1

    # Serve converted WebVTT sidecar
    sub_res = client.get("/api/subtitles", params={"path": video_b64, "id": "ext:Episode01.en.srt"})
    assert sub_res.status_code == 200
    assert sub_res.headers["content-type"].startswith("text/vtt")
    assert "00:00:00.500 --> 00:00:02.500" in sub_res.text

    # Reject traversal in external subtitle ID
    bad_sub = client.get("/api/subtitles", params={"path": video_b64, "id": "ext:../secret.srt"})
    assert bad_sub.status_code == 400

    # Transcode returns 503 cleanly when ffmpeg is missing
    transcode_res = client.get(
        "/api/stream/transcode", params={"path": video_b64, "audio": 0, "start": 0}
    )
    assert transcode_res.status_code == 503


def test_adjacent_episodes_natural_order_and_ass_subtitles(
    client: TestClient,
    isolated_env: dict[str, Path],
) -> None:
    media_root = isolated_env["media_root"]
    ep1 = media_root / "Show Ep 1.mp4"
    ep2 = media_root / "Show Ep 2.mp4"
    ep10 = media_root / "Show Ep 10.mp4"
    for ep in (ep1, ep2, ep10):
        ep.write_bytes(b"mp4-bytes")

    ass_content = (
        "[Script Info]\nPlayResX: 1920\nPlayResY: 1080\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour\n"
        "Style: Default,Arial,54,&H00FFFFFF\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\an8}Sign Text\n"
    )
    (media_root / "Show Ep 2.en.ass").write_text(ass_content, encoding="utf-8")

    client.post("/api/roots", json={"path": str(media_root)})

    ep2_b64 = encode_b64_path(str(ep2))
    info_res = client.get("/api/media/info", params={"path": ep2_b64})
    assert info_res.status_code == 200
    info = info_res.json()
    assert info["prev_item"]["name"] == "Show Ep 1.mp4"
    assert info["next_item"]["name"] == "Show Ep 10.mp4"

    ass_res = client.get(
        "/api/subtitles",
        params={"path": ep2_b64, "id": "ext:Show Ep 2.en.ass", "format": "ass"},
    )
    assert ass_res.status_code == 200
    assert "[V4+ Styles]" in ass_res.text
    assert "{\\an8}Sign Text" in ass_res.text

