/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── TWO DEV SERVERS, ONE FOLDER ───────────────────────────────────────────
  // `next dev` writes its chunks into .next and serves them from there, so two
  // of them started in this directory overwrite each other's output. The
  // symptom is not an error: the second server answers every page with 200 and
  // a 404 for its own stylesheet, and the panel arrives as unstyled HTML.
  //
  // That is exactly how somebody runs the demo (NEXT_PUBLIC_DEMO=1) beside the
  // normal one, so the demo gets its own folder instead:
  //
  //   NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_DEMO=1 npx next dev -p 3100
  //
  // Unset, which is every deployment and every ordinary `npm run dev`, it is
  // the default .next and nothing changes.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
