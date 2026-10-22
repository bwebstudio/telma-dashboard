Matter — Regular (400), Medium (500), Semibold (600).
Basis Grotesque Mono Pro — Regular (400).

The same pairing the site is set in: Matter is what the clinic reads, the mono
is what the panel says about itself (the small capital labels over a section, a
status, a count). Declared in lib/fonts.ts, which explains why three weights and
not four.

Self hosted through next/font/local, for performance and because a font served
from someone else's CDN tells them which clinic opened the panel and when.

This is Matter, not Matter SQ. If the brand settles on the squared cut, the
swap is three .woff2 files and the three `src` paths in lib/fonts.ts; nothing
else here changes.

/!\ THESE ARE TRIAL CUTS, licensed for evaluation. Fine for building and
showing. Before the panel is in front of a paying clinic, the licensed web
fonts have to replace them. Same names, same weights, same file names.

Matter ships latin-extended here and the mono ships latin only, and the
difference is deliberate: Matter renders names that clinics type, and a clinic
in Lisbon books Kowalski and Nováková in the same morning, while the mono only
ever renders words we wrote.

To regenerate the subsets from the source files:

  pip3 install fonttools brotli

  python3 - <<'PY'
  from fontTools import subset
  src = "/path/to/fonts"           # folder holding the source .otf/.ttf
  out = "public/fonts"
  latin = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
           "U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,"
           "U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
  ext = latin + ",U+0100-024F,U+0259,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF"
  for name in ["Regular", "Medium", "SemiBold"]:
      subset.main([f"{src}/Matter-{name}.otf", f"--unicodes={ext}",
                   "--layout-features=*", "--flavor=woff2", "--desubroutinize",
                   f"--output-file={out}/Matter-{name}-latin-ext.woff2"])
  subset.main([f"{src}/BasisGrotesqueMonoPro-Regular.otf", f"--unicodes={latin}",
               "--layout-features=*", "--flavor=woff2", "--desubroutinize",
               f"--output-file={out}/BasisGrotesqueMonoPro-Regular-latin.woff2"])
  PY

Matter has no variable axis, so there is no 550: `.h-display` is 600 and
Tailwind's `font-mid` is 500. See app/globals.css and tailwind.config.ts.
