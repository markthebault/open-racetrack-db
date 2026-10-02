"""Stitch unchanged public RGB tiles on their exact published Web Mercator grid."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

if len(sys.argv) != 3:
    raise SystemExit('Pass tile directory and output PNG path')
root = Path(__file__).parent
manifest = json.loads((root / 'agea-adria-2024-import.json').read_text())
tiles, output = Path(sys.argv[1]), Path(sys.argv[2])
size = manifest['tileSize']
column0, column1 = manifest['columnRange']
row0, row1 = manifest['rowRange']
mosaic = Image.new('RGB', ((column1-column0+1)*size, (row1-row0+1)*size))
for tile in manifest['tiles']:
    file = tiles / tile['file']
    if hashlib.sha256(file.read_bytes()).hexdigest() != tile['sha256']:
        raise ValueError(f'Changed tile: {file}')
    image = Image.open(file).convert('RGB')
    if image.size != (size, size):
        raise ValueError(f'Invalid tile size: {file}')
    mosaic.paste(image, ((tile['column']-column0)*size, (tile['row']-row0)*size))
mosaic.save(output)
if hashlib.sha256(output.read_bytes()).hexdigest() != manifest['mosaic']['sha256']:
    raise ValueError('Output hash differs from pinned mosaic')
print('Verified public mosaic', output)
