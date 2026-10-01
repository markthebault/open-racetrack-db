# Worldwide coverage

Status on 2026-09-30: **401 venues and 410 draft traces across 52 countries**. The worldwide expansion adds 240 venues to the European preview. Every configured acquisition has a result: 249 saved extracts, and Antarctica with no matching OSM country area. The inventory covers 249 ISO country/territory identifiers plus XK, taken from the public-domain IANA tzdata country table. It does not establish complete coverage of actual circuits.

## Acquisition and coordinate sources

The target remains permanent car and motorcycle circuits. Karting and motocross are excluded. This pass concentrates on road circuits and paved ovals; unsupported or ambiguous facilities remain research candidates. Worldwide acquisition includes full Russia and all configured territories. The earlier European extracts and routes are retained. Their successful acquisition flags describe saved queries; those older queries did not independently emit a country-area marker.

World discovery sends batches of at most twelve country codes through one serial request stream. Each OSM area marker appears before its geometry results. The importer partitions results using the marker's ISO code, merges identical repeated objects, rejects conflicting duplicates and unassigned objects, and records missing markers as unavailable areas. It rejects responses with a server remark, including partial query results. A cached valid hash is reused. Contributor IDs and usernames are stripped; source way/node IDs and versions stay intact.

The manifest stores the endpoint, acquisition date, query, requested country codes, partition method, element count and snapshot hash. Snapshots remain pinned. A deliberate source refresh needs a retained prior snapshot and manual recipe review. [Overpass's public-instance guidance](https://wiki.openstreetmap.org/wiki/Overpass_API) informs the serial requests and retry delays. Country batching follows its [foreach output semantics](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#For-each_loop_(foreach)).

Only OSM raceway ways supply coordinates. Area polygons identify facilities but never become course traces. Recipes join exact shared node IDs, pin way versions and preserve source coordinates. Known closed named ways are preferred; otherwise a bounded search selects a connected cycle. The world minimum is 500 m to retain small car circuits and paved ovals. Explicit pit, karting, motocross, off-road and unpaved ways are filtered. Multilingual exclusions cover common Japanese, Chinese, Korean and Cyrillic labels. Separate facilities may share a name; matching facility identities and nearby source groups require layout association.

Curated venue-name patterns are classification hints, not named-layout or operating-status verification. Operator references support identity only. For example, [Autobahn](https://autobahncc.com/), [Monticello](https://www.monticellomotorclub.com/), [NCM](https://www.motorsportspark.org/), and [Brainerd](https://www.birmn.com/) were checked for venue identification. No website coordinates enter the database. Validators reject any reference source used by a coordinate feature, regardless of its license label.

## Data still requiring review

All 410 published traces are draft and lack independently reusable public timing evidence. A source cycle can combine alternative branches and need not match the full, GP, oval, or motorcycle configuration. Unknown travel direction, course association and operating status remain stated in source reviews. Historical facilities can remain in the draft inventory; this is not an active-circuit directory.

There are 3579 pending source groups or named facilities, and 5384 eligible source groups without a selected closed cycle. Those counts include unclassified and out-of-scope objects, fragments and short courses. They are not totals of missing car circuits. Some countries have no published venue even though their extracts contain candidates. Source acquisition success cannot establish that a country has no circuits.

Circuit of The Americas has a named OSM facility but no selected eligible closed trace in this extraction. Branching and incomplete source traces affect other large venues too. Existing European gaps, including Brno, Navarra, the full Nürburgring GP course and Bridge to Gantry, remain open. See [the European report](07-european-coverage.md) and the downloadable `data/world-coverage.json` inventory. Complete worldwide venue or layout coverage is not claimed.

reference is read only for start/finish GPS and layout names, never CIR geometry, map images or boundaries. The optional private overlay associates a single start/finish record within 20 m of a new source trace and labels it proximity-only. Its original GPS center is preserved, with estimated 25 m display endpoints. The match does not verify a named layout, direction or redistribution rights. No private timing enters public GeoJSON, builds, screenshots or the PR.

## Viewer and persistent preview

The viewer browses the expanded catalogue offline apart from optional map tiles. Worldwide coverage shows acquisition status, published venue counts and pending groups for all 250 identifiers. GeoJSON downloads contain public traces only. Source reviews retain the exact recipe and source links. Deep links, filtering, downloads and mobile controls remain available.

On macOS, `npm run preview:install` copies the built public site and optional separate timing overlay into Application Support and installs `local.open-racetrack.preview`. The LaunchAgent listens on localhost port 5190, restarts after an exit, and survives terminal-session changes. Existing Tailscale Serve routing on port 8445 is retained. Re-run the installer after a build or Node installation change. The optional timing overlay stays outside its public web root.

## Validation

The build validates every source recipe, hash, version, exact join, schema and generated-file reproduction. Worldwide validation also checks the acquisition inventory and rejects excluded ways in published world selections. Unit tests cover disconnected nodes, source-version changes, gate-center preservation, short circuits, direction, bounded enumeration, retry timing, reference-coordinate restrictions and batch partitioning. Browser checks open every published layout, verify public downloads, filtering, deep-link zoom, stale-request handling and mobile controls. These checks establish software behavior and source topology, not real-world layout correctness.

## Country and territory inventory

| Acquisition | Status | Published venues | Pending candidates |
| --- | --- | ---: | ---: |
| Afghanistan | fetched | 0 | 0 |
| Åland Islands | fetched | 0 | 1 |
| Albania | fetched | 0 | 0 |
| Algeria | fetched | 0 | 3 |
| American Samoa | fetched | 0 | 0 |
| Andorra | fetched | 0 | 0 |
| Angola | fetched | 0 | 3 |
| Anguilla | fetched | 0 | 0 |
| Antarctica | area-unavailable | 0 | 0 |
| Antigua & Barbuda | fetched | 0 | 0 |
| Argentina | fetched | 33 | 260 |
| Armenia | fetched | 0 | 0 |
| Aruba | fetched | 0 | 0 |
| Australia | fetched | 19 | 131 |
| Austria | fetched | 2 | 11 |
| Azerbaijan | fetched | 0 | 0 |
| Bahamas | fetched | 0 | 0 |
| Bahrain | fetched | 1 | 0 |
| Bangladesh | fetched | 0 | 1 |
| Barbados | fetched | 0 | 2 |
| Belarus | fetched | 0 | 4 |
| Belgium | fetched | 2 | 5 |
| Belize | fetched | 0 | 0 |
| Benin | fetched | 0 | 0 |
| Bermuda | fetched | 0 | 0 |
| Bhutan | fetched | 0 | 0 |
| Bolivia | fetched | 0 | 10 |
| Bosnia and Herzegovina | fetched | 0 | 3 |
| Botswana | fetched | 0 | 1 |
| Bouvet Island | fetched | 0 | 0 |
| Brazil | fetched | 17 | 171 |
| British Indian Ocean Territory | fetched | 0 | 0 |
| British Virgin Islands | fetched | 0 | 0 |
| Brunei | fetched | 0 | 0 |
| Bulgaria | fetched | 0 | 9 |
| Burkina Faso | fetched | 0 | 3 |
| Burundi | fetched | 0 | 0 |
| Cambodia | fetched | 0 | 1 |
| Cameroon | fetched | 0 | 0 |
| Canada | fetched | 21 | 46 |
| Cape Verde | fetched | 0 | 1 |
| Caribbean Netherlands | fetched | 0 | 0 |
| Cayman Islands | fetched | 0 | 0 |
| Central African Republic | fetched | 0 | 0 |
| Chad | fetched | 0 | 0 |
| Chile | fetched | 6 | 51 |
| China | fetched | 10 | 194 |
| Christmas Island | fetched | 0 | 0 |
| Cocos (Keeling) Islands | fetched | 0 | 0 |
| Colombia | fetched | 1 | 8 |
| Comoros | fetched | 0 | 0 |
| Congo - Brazzaville | fetched | 0 | 0 |
| Congo - Kinshasa | fetched | 0 | 1 |
| Cook Islands | fetched | 0 | 0 |
| Costa Rica | fetched | 0 | 2 |
| Côte d’Ivoire | fetched | 0 | 0 |
| Croatia | fetched | 1 | 5 |
| Cuba | fetched | 0 | 2 |
| Curaçao | fetched | 0 | 0 |
| Cyprus | fetched | 0 | 2 |
| Czechia | fetched | 3 | 22 |
| Denmark | fetched | 4 | 4 |
| Djibouti | fetched | 0 | 0 |
| Dominica | fetched | 0 | 0 |
| Dominican Republic | fetched | 0 | 3 |
| Ecuador | fetched | 0 | 10 |
| Egypt | fetched | 0 | 2 |
| El Salvador | fetched | 1 | 1 |
| Equatorial Guinea | fetched | 0 | 0 |
| Eritrea | fetched | 0 | 0 |
| Estonia | fetched | 1 | 11 |
| Eswatini | fetched | 0 | 0 |
| Ethiopia | fetched | 0 | 0 |
| Falkland Islands | fetched | 0 | 0 |
| Faroe Islands | fetched | 0 | 0 |
| Fiji | fetched | 0 | 0 |
| Finland | fetched | 8 | 28 |
| France | fetched | 37 | 76 |
| French Guiana | fetched | 0 | 0 |
| French Polynesia | fetched | 0 | 0 |
| French Southern Territories | fetched | 0 | 0 |
| Gabon | fetched | 0 | 0 |
| Gambia | fetched | 0 | 0 |
| Georgia | fetched | 1 | 2 |
| Germany | fetched | 6 | 70 |
| Ghana | fetched | 0 | 0 |
| Gibraltar | fetched | 0 | 0 |
| Greece | fetched | 2 | 12 |
| Greenland | fetched | 0 | 0 |
| Grenada | fetched | 0 | 0 |
| Guadeloupe | fetched | 0 | 0 |
| Guam | fetched | 0 | 0 |
| Guatemala | fetched | 0 | 3 |
| Guernsey | fetched | 0 | 1 |
| Guinea | fetched | 0 | 0 |
| Guinea-Bissau | fetched | 0 | 0 |
| Guyana | fetched | 0 | 3 |
| Haiti | fetched | 0 | 0 |
| Heard & McDonald Islands | fetched | 0 | 0 |
| Honduras | fetched | 0 | 1 |
| Hong Kong SAR China | fetched | 0 | 0 |
| Hungary | fetched | 3 | 14 |
| Iceland | fetched | 0 | 3 |
| India | fetched | 2 | 7 |
| Indonesia | fetched | 2 | 42 |
| Iran | fetched | 0 | 14 |
| Iraq | fetched | 0 | 0 |
| Ireland | fetched | 1 | 2 |
| Isle of Man | fetched | 0 | 2 |
| Israel | fetched | 0 | 1 |
| Italy | fetched | 19 | 91 |
| Jamaica | fetched | 0 | 3 |
| Japan | fetched | 15 | 127 |
| Jersey | fetched | 0 | 0 |
| Jordan | fetched | 0 | 0 |
| Kazakhstan | fetched | 1 | 7 |
| Kenya | fetched | 0 | 1 |
| Kiribati | fetched | 0 | 0 |
| Kosovo | fetched | 0 | 0 |
| Kuwait | fetched | 1 | 3 |
| Kyrgyzstan | fetched | 0 | 0 |
| Laos | fetched | 0 | 0 |
| Latvia | fetched | 0 | 21 |
| Lebanon | fetched | 0 | 3 |
| Lesotho | fetched | 0 | 0 |
| Liberia | fetched | 0 | 0 |
| Libya | fetched | 0 | 0 |
| Liechtenstein | fetched | 0 | 0 |
| Lithuania | fetched | 1 | 17 |
| Luxembourg | fetched | 0 | 1 |
| Macao SAR China | fetched | 0 | 0 |
| Madagascar | fetched | 0 | 3 |
| Malawi | fetched | 0 | 0 |
| Malaysia | fetched | 3 | 12 |
| Maldives | fetched | 0 | 0 |
| Mali | fetched | 0 | 0 |
| Malta | fetched | 0 | 0 |
| Marshall Islands | fetched | 0 | 0 |
| Martinique | fetched | 0 | 0 |
| Mauritania | fetched | 0 | 0 |
| Mauritius | fetched | 0 | 0 |
| Mayotte | fetched | 0 | 0 |
| Mexico | fetched | 6 | 45 |
| Micronesia | fetched | 0 | 0 |
| Moldova | fetched | 0 | 0 |
| Monaco | fetched | 0 | 0 |
| Mongolia | fetched | 0 | 0 |
| Montenegro | fetched | 0 | 0 |
| Montserrat | fetched | 0 | 0 |
| Morocco | fetched | 0 | 3 |
| Mozambique | fetched | 0 | 1 |
| Myanmar (Burma) | fetched | 0 | 1 |
| Namibia | fetched | 0 | 3 |
| Nauru | fetched | 0 | 0 |
| Nepal | fetched | 0 | 1 |
| Netherlands | fetched | 2 | 13 |
| New Caledonia | fetched | 0 | 1 |
| New Zealand | fetched | 6 | 594 |
| Nicaragua | fetched | 0 | 0 |
| Niger | fetched | 0 | 1 |
| Nigeria | fetched | 0 | 0 |
| Niue | fetched | 0 | 0 |
| Norfolk Island | fetched | 0 | 0 |
| North Korea | fetched | 0 | 0 |
| North Macedonia | fetched | 0 | 2 |
| Northern Mariana Islands | fetched | 0 | 0 |
| Norway | fetched | 3 | 46 |
| Oman | fetched | 0 | 3 |
| Pakistan | fetched | 0 | 2 |
| Palau | fetched | 0 | 0 |
| Palestinian Territories | fetched | 0 | 0 |
| Panama | fetched | 0 | 2 |
| Papua New Guinea | fetched | 0 | 0 |
| Paraguay | fetched | 0 | 18 |
| Peru | fetched | 1 | 4 |
| Philippines | fetched | 2 | 8 |
| Pitcairn Islands | fetched | 0 | 0 |
| Poland | fetched | 3 | 31 |
| Portugal | fetched | 4 | 13 |
| Puerto Rico | fetched | 0 | 5 |
| Qatar | fetched | 1 | 0 |
| Réunion | fetched | 0 | 1 |
| Romania | fetched | 2 | 6 |
| Russia | fetched | 8 | 235 |
| Rwanda | fetched | 0 | 0 |
| Samoa | fetched | 0 | 0 |
| San Marino | fetched | 0 | 1 |
| São Tomé & Príncipe | fetched | 0 | 0 |
| Saudi Arabia | fetched | 0 | 14 |
| Senegal | fetched | 0 | 3 |
| Serbia | fetched | 0 | 2 |
| Seychelles | fetched | 0 | 1 |
| Sierra Leone | fetched | 0 | 0 |
| Singapore | fetched | 0 | 1 |
| Sint Maarten | fetched | 0 | 0 |
| Slovakia | fetched | 1 | 6 |
| Slovenia | fetched | 0 | 2 |
| Solomon Islands | fetched | 0 | 0 |
| Somalia | fetched | 0 | 0 |
| South Africa | fetched | 6 | 24 |
| South Georgia & South Sandwich Islands | fetched | 0 | 0 |
| South Korea | fetched | 2 | 32 |
| South Sudan | fetched | 0 | 0 |
| Spain | fetched | 20 | 77 |
| Sri Lanka | fetched | 0 | 3 |
| St. Barthélemy | fetched | 0 | 0 |
| St. Helena | fetched | 0 | 0 |
| St. Kitts & Nevis | fetched | 0 | 0 |
| St. Lucia | fetched | 0 | 0 |
| St. Martin | fetched | 0 | 0 |
| St. Pierre & Miquelon | fetched | 0 | 0 |
| St. Vincent & Grenadines | fetched | 0 | 0 |
| Sudan | fetched | 0 | 0 |
| Suriname | fetched | 0 | 0 |
| Svalbard & Jan Mayen | fetched | 0 | 0 |
| Sweden | fetched | 8 | 62 |
| Switzerland | fetched | 0 | 3 |
| Syria | fetched | 0 | 2 |
| Taiwan | fetched | 0 | 9 |
| Tajikistan | fetched | 0 | 0 |
| Tanzania | fetched | 0 | 0 |
| Thailand | fetched | 2 | 12 |
| Timor-Leste | fetched | 0 | 0 |
| Togo | fetched | 0 | 0 |
| Tokelau | fetched | 0 | 0 |
| Tonga | fetched | 0 | 0 |
| Trinidad & Tobago | fetched | 0 | 0 |
| Tunisia | fetched | 0 | 1 |
| Türkiye | fetched | 1 | 4 |
| Turkmenistan | fetched | 0 | 1 |
| Turks & Caicos Islands | fetched | 0 | 0 |
| Tuvalu | fetched | 0 | 0 |
| U.S. Outlying Islands | fetched | 0 | 0 |
| U.S. Virgin Islands | fetched | 0 | 0 |
| Uganda | fetched | 0 | 0 |
| Ukraine | fetched | 0 | 22 |
| United Arab Emirates | fetched | 1 | 10 |
| United Kingdom | fetched | 21 | 54 |
| United States | fetched | 76 | 606 |
| Uruguay | fetched | 0 | 12 |
| Uzbekistan | fetched | 0 | 7 |
| Vanuatu | fetched | 0 | 0 |
| Vatican City | fetched | 0 | 0 |
| Venezuela | fetched | 1 | 9 |
| Vietnam | fetched | 0 | 2 |
| Wallis & Futuna | fetched | 0 | 0 |
| Western Sahara | fetched | 0 | 0 |
| Yemen | fetched | 0 | 0 |
| Zambia | fetched | 0 | 1 |
| Zimbabwe | fetched | 0 | 3 |
