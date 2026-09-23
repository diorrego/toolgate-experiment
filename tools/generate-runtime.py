"""Copy the locked generated API schema into Go embed; Rust includes shared directly."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
src=(root/'shared/schemas/api.schema.json').read_bytes()
target=root/'backend-go/internal/core/api.generated.json'
if '--check' in sys.argv:
    if target.read_bytes()!=src:raise SystemExit('Embedded API schema drift')
else:target.write_bytes(src)
