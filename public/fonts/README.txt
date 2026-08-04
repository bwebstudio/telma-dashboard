Suisse Int'l — Regular (400), Medium (500), Semibold (600), Bold (700).
Self hosted through next/font/local, for performance and because a font served
from someone else's CDN tells them which clinic opened the panel and when.

/!\ THESE ARE THE TEST (TRIAL) CUT — SuisseIntlTest-*.otf, from FFT_Romina.
Fine for building and showing. Before the panel is in front of a paying clinic,
the licensed web fonts have to replace them. Nothing else changes: same four
weights, same file names.

The files here are subset to Latin, Latin-1 and Latin Extended-A (Portuguese
and Spanish accents) plus the punctuation, currency and arrows the interface
draws with text — 146KB for the four weights instead of 830KB.

To regenerate from the OTF sources:

  pip3 install fonttools brotli

  python3 - <<'PY'
  from fontTools import subset
  src = "/path/to/SuisseIntl"      # folder holding the .otf files
  out = "public/fonts"
  ranges = ("U+0000-00FF,U+0100-017F,U+0180-024F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
            "U+0300-036F,U+2000-206F,U+2070,U+2074,U+20A0-20BF,U+2122,U+2190-2193,"
            "U+2212,U+2215,U+2713,U+2714,U+25CF,U+00B7,U+FEFF,U+FFFD")
  for name in ["Regular", "Medium", "Semibold", "Bold"]:
      subset.main([f"{src}/SuisseIntlTest-{name}.otf", f"--unicodes={ranges}",
                   "--layout-features=*", "--flavor=woff2", "--desubroutinize",
                   f"--output-file={out}/SuisseIntl-{name}.woff2"])
  PY

Suisse has no variable axis, so there is no 550: `.h-display` is 600 and
Tailwind's `font-mid` is 500. See app/globals.css and tailwind.config.ts.
