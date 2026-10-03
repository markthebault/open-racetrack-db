# Rosario historical aerial review

The municipal [InfoMapa viewer](https://infomapa.rosario.gov.ar/emapa/mapa.htm) identifies `Fotos2013` and `Img2022` as municipal aerial photographs. The pinned native EPSG:22185 exports resolve the earlier circuit and the later northern shortcut and western inner hairpin. The 2022 search extent comes from the public mapped raceway, with 50 metres of padding. Both files retain their original pixels. They are inspection evidence, with no course vertices or imported layout recipe.

The [public WMS dataset metadata](https://datosabiertos.rosario.gob.ar/api/1/metastore/schemas/dataset/items/c9f6368b-9bf0-4479-84ec-0d5823b37687) declares ODbL 1.0. Annex II of the [municipal digital terms](https://www.rosario.gob.ar/normativa/verArchivo?id=178433&modo=attachment&tipo=pdf) explicitly covers InfoMapa and declares public-sector information under Open Government Licence v3.0. The terms PDF, its hash, the dataset declaration, image attribution and exact WMS requests are pinned in `acquisition-review.json`. These declarations are preserved separately. No unspecified Creative Commons variant is assumed. The distinct 2011 satellite layer is excluded.

The [operator history](https://autodromorosario.com/historia), [race organizer's course description](https://apat.org.ar/circuitos/tecnica/rosario), and [independently authored historical configuration plans](https://www.racingcircuits.info/south-america/argentina/rosario.html) distinguish earlier and later circuits. Their diagrams identify configurations only; no diagram is traced or georeferenced. A public November 2017 Sentinel image was also inspected at its native 10-metre resolution. It resolves the large extension but cannot supply fine historical connectors.

The exact northern open Combo route remains unresolved. The existing 2,279.7-metre connected public-road candidate omits configuration details. Neither the larger southern circuit nor a selection of plausible paved branches establishes the requested route. No geometry is added to the mapped count, and no private course positions are read or imported.

To reproduce the native exports and verify their dimensions and hashes:

```sh
python3 sources/research/rosario-public-imagery/download-public-images.py /tmp/rosario-public-imagery
```
