#!/usr/bin/env python3
import argparse
import json
import sys
import wave
from typing import List, Dict

try:
    from vosk import Model, KaldiRecognizer, SetLogLevel
except Exception as e:
    print(json.dumps({"error": f"vosk import failed: {str(e)}"}))
    sys.exit(2)


def group_words(words: List[Dict]) -> List[Dict]:
    segments = []
    if not words:
        return segments

    MAX_WORDS = 14
    MAX_DURATION = 4.5
    GAP_FLUSH = 0.35  # segundos: si hay pausa >= 350ms, corta segmento
    buffer = []

    def flush():
        nonlocal buffer
        if not buffer:
            return
        start = buffer[0]["start"]
        end = buffer[-1]["end"]
        text = " ".join(w["word"] for w in buffer).strip()
        if text:
            segments.append({
                "start": start,
                "end": max(end, start + 1.2),
                "text": text,
            })
        buffer = []

    for w in words:
        if not w.get("word"):
            continue
        if buffer:
            gap = w.get("start", 0) - buffer[-1].get("end", 0)
            if gap >= GAP_FLUSH:
                flush()
        buffer.append(w)
        if len(buffer) >= MAX_WORDS or (buffer[-1]["end"] - buffer[0]["start"]) >= MAX_DURATION:
            flush()

    flush()
    return segments


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--audio", required=True, help="Path to mono 16kHz WAV file")
    args = parser.parse_args()

    SetLogLevel(0)

    try:
        wf = wave.open(args.audio, "rb")
    except Exception as e:
        print(json.dumps({"error": f"cannot open wav: {str(e)}"}))
        sys.exit(2)

    if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != 16000:
        print(json.dumps({"error": "wav must be mono, 16-bit, 16kHz"}))
        sys.exit(2)

    try:
        model = Model(args.model_dir)
    except Exception as e:
        print(json.dumps({"error": f"cannot load model: {str(e)}"}))
        sys.exit(2)

    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)

    words: List[Dict] = []
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            res = json.loads(rec.Result())
            if "result" in res:
                words.extend(res["result"])  # list of {word,start,end}
    final = json.loads(rec.FinalResult())
    if "result" in final:
        words.extend(final["result"])

    segments = group_words(words)
    # Devolver tanto segmentos (para compatibilidad) como palabras crudas con tiempos
    print(json.dumps({"segments": segments, "words": words}))


if __name__ == "__main__":
    main()
