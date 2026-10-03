# Lihpao public map coverage

The Wind course needs a short western closing connector. The public full-course way includes the separate Thunder branch; its connected shape cannot stand in for the shorter course.

Two additional open sources were checked on 3 October 2026. Neither supplies the missing connector, so neither adds a mapped layout.

The [Taichung municipal road dataset](https://data.gov.tw/dataset/177459) publishes a 2025 citywide package. Its centerline download is a 7zip archive, despite its download label. The scoped review retains 179 nearby lines in their native TWD97 TM2 zone 121 coordinates, equivalent to EPSG:3826. The line geometry is not clipped, snapped or moved. Only record identity, road name, district and update year are retained. These lines surround the circuit but do not map its internal course roads.

The municipality's linked field description defines `R2L` as the record update year. The local subset contains 16 records with year 2013, 153 with year 2017 and 10 with year 2018. A 2025 package label therefore does not establish 2025 local survey coverage. The update field also does not guarantee an aerial acquisition date. The scoped native extent, member names, original archive fingerprint and subset fingerprint are pinned in `municipal-road-review.json`.

The national [Taiwan e-Map open dataset](https://data.gov.tw/dataset/25108) explicitly covers tiles through level 15, approximately 1:18,000. Four tiles from **EMAP6_OPENDATA** are mosaicked without resizing, smoothing or reprojection. Their native pixels do not show racecourse roads at this venue. Exact tile URLs, hashes, tile indices and the EPSG:3857 mosaic extent are pinned in `open-map-review.json`. The saved 512 by 512 image is this native mosaic.

Both datasets declare the [Open Government Data License, version 1.0](https://data.gov.tw/license). The declared license is preserved. Its section 4.2 describes compatibility with CC BY 4.0; that compatibility does not change the original declaration. Attribution:

- Taichung City Government, 2025 one-thousandth road map, retrieved 2026.
- National Land Surveying and Mapping Center, Taiwan e-Map without contours, open-data tiles at level 15, retrieved 2026.

This open data is released under the Open Government Data License, version 1.0. It may be used under that license's conditions. The [official supply table](https://www.nlsc.gov.tw/cp.aspx?n=1549) distinguishes this coarse open-data service from finer map and aerial services with separate terms. Finer public display layers are not treated as open-data geometry sources.

Reproduce the sources from the repository root with Python, Pillow, pyshp and `bsdtar` installed:

```sh
python3 sources/research/lihpao-public-map-coverage/reproduce-sources.py --output /tmp/lihpao-source-review
```

The command checks the original bytes, archive member names, native tile dimensions, source line count and reproduced output hashes. A changed source is rejected for further review. Neither these municipal lines nor the open map provides a complete Wind course trace.
