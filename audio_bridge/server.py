import asyncio
import os
import http
import hmac
import struct
import pyaudiowpatch as pa
import websockets

HOST = "127.0.0.1"
PORT = 8765
TARGET_RATE = 16000
CHUNK_MS = 100
EXPECTED_TOKEN = os.environ.get("STEALTH_BRIDGE_TOKEN")

def resample_and_mono(raw_bytes, from_rate, channels):
    samples = struct.unpack(f"<{len(raw_bytes)//2}h", raw_bytes)
    if channels == 2:
        samples = tuple((samples[i] + samples[i+1]) // 2 for i in range(0, len(samples), 2))
    
    if from_rate != TARGET_RATE:
        step = from_rate / TARGET_RATE
        out = []
        idx = 0.0
        while idx < len(samples):
            out.append(samples[int(idx)])
            idx += step
        samples = out
    
    return struct.pack(f"<{len(samples)}h", *samples)

def get_target_device(p):
    # Try default wasapi loopback
    try:
        dev = p.get_default_wasapi_loopback()
        print(f"[bridge] Selected default loopback: {dev['name']}", flush=True)
        return dev
    except Exception as e:
        print(f"[bridge] get_default_wasapi_loopback failed: {e}", flush=True)

    # Fallback to any valid loopback device
    for i in range(p.get_device_count()):
        info = p.get_device_info_by_index(i)
        if info.get("isLoopbackDevice") and info.get("maxInputChannels", 0) > 0:
            print(f"[bridge] Fallback loopback: {info['name']}", flush=True)
            return info
    return None

async def handler(websocket):
    print("[bridge] Client connected", flush=True)
    p = pa.PyAudio()
    dev = get_target_device(p)
    if not dev:
        print("[bridge] No loopback device found", flush=True)
        p.terminate()
        return

    rate = int(dev["defaultSampleRate"])
    channels = min(int(dev["maxInputChannels"]), 2)
    chunk = int(rate * CHUNK_MS / 1000)

    try:
        stream = p.open(
            format=pa.paInt16,
            channels=channels,
            rate=rate,
            input=True,
            input_device_index=int(dev["index"]),
            frames_per_buffer=chunk
        )
    except Exception as e:
        print(f"[bridge] Failed to open stream on {dev['name']}: {e}", flush=True)
        p.terminate()
        return

    print(f"[bridge] Streaming audio from {dev['name']} @ {rate}Hz...", flush=True)
    loop = asyncio.get_running_loop()

    try:
        while True:
            # stream.read blocks until audio is available. Run in executor so asyncio loop stays responsive!
            data = await loop.run_in_executor(None, stream.read, chunk, False)
            processed = resample_and_mono(data, rate, channels)
            await websocket.send(processed)
    except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
        print("[bridge] Client disconnected", flush=True)
    except Exception as e:
        print(f"[bridge] Error during stream: {e}", flush=True)
    finally:
        try:
            stream.stop_stream()
            stream.close()
        except Exception:
            pass
        p.terminate()
        print("[bridge] Cleaned up audio stream", flush=True)

def check_auth(connection, request):
    if not EXPECTED_TOKEN:
        return None
    token = request.headers.get("x-bridge-token")
    if not token or not hmac.compare_digest(token, EXPECTED_TOKEN):
        print("[bridge] Unauthorized connection attempt rejected", flush=True)
        return connection.respond(http.HTTPStatus.UNAUTHORIZED, "Unauthorized\n")
    return None

async def main():
    print(f"[bridge] Server running on ws://{HOST}:{PORT}", flush=True)
    async with websockets.serve(handler, HOST, PORT, process_request=check_auth):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
