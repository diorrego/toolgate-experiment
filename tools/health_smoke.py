"""Exercise both actual bootstrap binaries; correctness only, not a benchmark."""
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def smoke(binary):
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    process = subprocess.Popen([str(ROOT / binary)], env={**os.environ, 'TOOLGATE_LISTEN_ADDR': f'127.0.0.1:{port}'}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 10
        while True:
            if process.poll() is not None:
                raise AssertionError(f'{binary} failed to start')
            try:
                response = urllib.request.urlopen(f'http://127.0.0.1:{port}/health/live', timeout=0.5)
                break
            except urllib.error.URLError:
                if time.monotonic() >= deadline:
                    raise AssertionError(f'{binary} did not become live') from None
                time.sleep(0.05)
        with response:
            assert response.status == 200
            assert response.headers['Content-Type'] == 'application/json'
            assert response.headers['Cache-Control'] == 'no-store'
            assert json.load(response) == {'status': 'ok'}
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health/ready', timeout=1)
            raise AssertionError('Uninitialized bootstrap advertised readiness')
        except urllib.error.HTTPError as error:
            with error:
                assert error.code == 503
                assert json.load(error) == {'status': 'not_ready'}
        process.terminate()
        process.wait(timeout=12)
        assert process.returncode == 0, f'Nonzero shutdown: {binary}'
        with socket.socket() as probe:
            assert probe.connect_ex(('127.0.0.1', port)) != 0, 'Listener leaked after shutdown'
        print(f'{binary}: live=200, ready=503, SIGTERM=0, listener closed')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        if process.stderr is not None:
            process.stderr.close()
    failed = subprocess.run([str(ROOT / binary)], env={**os.environ, 'TOOLGATE_LISTEN_ADDR': '0.0.0.0:9080'}, capture_output=True, timeout=5, check=False)
    assert failed.returncode != 0, 'Bootstrap unexpectedly allows a public listener'
    print(f'{binary}: rejected public bind')


if __name__ == '__main__':
    for binary in ['backend-go/bin/toolgate', 'backend-rust/target/release/toolgate-core']:
        smoke(binary)
