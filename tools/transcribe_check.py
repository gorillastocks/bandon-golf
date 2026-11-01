"""Transcribes every commentary clip with ElevenLabs Scribe and scans the transcripts for real-world names.
Needs ELEVENLABS_API_KEY.  Usage: python3 tools/transcribe_check.py [outfile.json]   (exit 1 if a banned term is found)"""
import json, os, re, subprocess, sys, glob, uuid, urllib.request
from concurrent.futures import ThreadPoolExecutor
ALLOWED = r"old mac ?donald had a links|abandon(ed)? trails"   # the parody names themselves are fine
BANNED = r"\bbandon\b|pacific|old mac ?donald|macdonald|sheep ranch|st\.? andrews|andrews|five mile|shorty|kidd|doak|coore|crenshaw|whitman|keiser|oregon|punchbowl|redan|biarritz|road hole|eden|alps|principal|scotland|ireland|pebble|augusta|cypress|usga|r&a|resort"
files = sorted(glob.glob('audio/commentary/*/*.mp3'))
def tr(f):
    b = uuid.uuid4().hex
    data = open(f, 'rb').read()
    parts = [('model_id', 'scribe_v1'), ('language_code', 'eng')]
    body = b''.join(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (b, k, v)).encode() for k, v in parts)
    body += ('--%s\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n' % b).encode() + data + ('\r\n--%s--\r\n' % b).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/speech-to-text', body, {'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'multipart/form-data; boundary=' + b})
    for a in range(4):
        try: return f, json.loads(urllib.request.urlopen(req, timeout=240).read())['text']
        except Exception as e: err = e
    return f, 'ERROR %s' % err
if len(sys.argv) > 2 and sys.argv[2] == '--rescan': res = json.load(open(sys.argv[1]))   # re-scan saved transcripts, no API calls
else:
    with ThreadPoolExecutor(4) as ex: res = dict(ex.map(tr, files))
if '--rescan' not in sys.argv: json.dump(res, open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/transcripts.json', 'w'), indent=1)
clean = {f: re.sub(ALLOWED, '', t, flags=re.I) for f, t in res.items()}
bad = {f: re.findall(BANNED, t, re.I) for f, t in clean.items() if re.search(BANNED, t, re.I) or t.startswith('ERROR')}
print('clips transcribed:', len(res), '| flagged:', len(bad))
for f, h in bad.items(): print(' ', f, h, res[f][:80] if res[f].startswith('ERROR') else '')
sys.exit(1 if bad else 0)
