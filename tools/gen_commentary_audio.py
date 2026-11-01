"""Voices every hole commentary text in audio/commentary/texts.json with ElevenLabs (voice JBFqnCBsd6RMkjVDRZzb, model eleven_v4),
re-encodes to 44.1 kHz mono 64 kbps MP3 with no ID3 tags, and rewrites audio/commentary/manifest.json.
Needs ELEVENLABS_API_KEY in the environment (never stored in the repo).   Run from the repo root.  Optional args: key prefixes to redo."""
import json, os, subprocess, sys, time, urllib.request, urllib.error
VOICE = 'JBFqnCBsd6RMkjVDRZzb'
texts = json.load(open('audio/commentary/texts.json'))
mp = 'audio/commentary/manifest.json'
try: m = json.load(open(mp))
except Exception: m = {'clips': {}}
m['voice'] = 'ElevenLabs George (%s), model eleven_v4' % VOICE
m['clips'] = {k: v for k, v in m.get('clips', {}).items() if k in texts}   # drop stale keys
only = sys.argv[1:]
import threading
from concurrent.futures import ThreadPoolExecutor
lock = threading.Lock()

def do(k, t):
    course, no = k.rsplit('_', 1)
    f = 'audio/commentary/%s/%s.mp3' % (course, no)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    c = m['clips'].get(k)
    if c and c.get('text') == t and os.path.exists(f) and c.get('dur'): return
    body = json.dumps({'text': t, 'model_id': 'eleven_v4'}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_128' % VOICE, body,
                                         {'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
            raw = urllib.request.urlopen(req, timeout=240).read(); break
        except (urllib.error.URLError, TimeoutError) as e:
            print('retry', k, getattr(e, 'code', None), flush=True); time.sleep(5 + attempt * 8)
    else: raise SystemExit('failed ' + k)
    tmp = '/tmp/raw_%s.mp3' % k
    open(tmp, 'wb').write(raw)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', f], check=True)
    os.remove(tmp)
    d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))
    with lock:
        m['clips'][k] = {'file': f, 'text': t, 'dur': round(d, 2)}
        m['clips'] = dict(sorted(m['clips'].items()))
        json.dump(m, open(mp, 'w'), indent=1); open(mp, 'a').write('\n')
    print(k, round(d, 1), flush=True)

jobs = [(k, t) for k, t in texts.items() if not only or any(k.startswith(p) for p in only)]
with ThreadPoolExecutor(4) as ex:
    list(ex.map(lambda a: do(*a), jobs))
