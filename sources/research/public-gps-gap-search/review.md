# Public GPS searches for unresolved layouts

The pinned index records **25 actual public API responses across nine venue search areas**, covering all eleven remaining supplied trace gaps. These rounded rectangles describe broad public venue areas, not course positions or timing gates. Response hashes, byte sizes, pagination, grouped-track counts and timed/untimed point counts are preserved. Raw commuter recordings, contributor identities and individual GPS positions are not redistributed.

The [OpenStreetMap server implementation](https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/api/tracepoints_controller.rb) distinguishes ordered trackable recordings from other points sorted geographically. Untimed anonymous points cannot be connected in their response order to reconstruct a lap. Timestamps alone also do not identify a racing configuration. No geometry is imported from these searches.

An empty terminal page was observed for eight bounded venue queries. Arlington was inspected through page five, where more ordinary road recordings remain; that search is explicitly incomplete. Neither an empty bounded query nor this index proves that no useful recording exists elsewhere or will be uploaded later.

The Kames and Thoresway timed recordings were plotted against public road mapping and inspected: they follow surrounding roads rather than the requested courses. The longer anonymous timed Elvington recording from July 2010 follows roads north of the airfield. The known Detroit airport recording remains a smaller southern apron loop. Charlotte's inspected pages do not identify the historical Short configuration. The other available sample groups do not establish the requested branch sequences, including Arlington's temporary event connectors. The index remains research evidence, not a layout recovery.

Verify the original cached responses from the repository root:

```sh
python3 sources/research/public-gps-gap-search/reproduce-index.py \
  --cache-dir .local/public-course-gps
```

Use `--online` instead to request those same pages through the ordinary public API. Live responses can differ from the captured snapshot; verification then fails and a new review is required. The first online recheck observed a changed Charlotte page-one response with unchanged group and point counts. The original snapshot remains pinned and passes offline verification; that live response is not silently substituted. The script reads point counts and the presence of timestamps without extracting coordinate values or generating routes.

Reviewed 3 October 2026. Exact historical course identity and reusable geometry are still needed for the unresolved entries.
