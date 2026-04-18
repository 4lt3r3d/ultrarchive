# ULTRARCHIVE

> Submit once. Preserved everywhere. No page left behind.

ULTRARCHIVE is an all-in-one web archiving tool that fires off a single URL to 12+ archive services simultaneously, so a page gets backed up in multiple places at once. No more juggling between Wayback Machine, Archive.today, Ghost Archive, and a dozen other services — paste a link, hit one button, done.

## Features

- ⚡ **One-click archive** — submit to 12+ archive services at once
- 👻 **Silent background submissions** — no tabs or windows open during archiving
- 🔍 **Search your history** — find every URL you've archived on this device
- 📊 **Coverage checker** — paste any URL to see which archive services already have it (via Wayback Machine availability API)
- 🧩 **Fill in the gaps** — if a URL is only archived in one or two services, ULTRARCHIVE can archive it to the ones still missing with one button
- 🌙 **Dark terminal aesthetic** — because archiving should look cool

## Services Supported

- 🕰 Wayback Machine (Internet Archive)
- 📸 Archive.today
- 👻 Ghost Archive
- 🐋 Megalodon (Japan)
- 🇵🇹 Arquivo.pt (Portugal)
- 🧊 FreezeFrame
- 📚 WebCite
- ⏱ Memento Time Travel
- 🔗 Perma.cc *(login required)*
- 🏛 Archive-It *(login required)*
- 🇬🇧 UK Web Archive *(login required)*
- 📹 PreserveTube (YouTube videos)

## Usage

Just open `index.html` in any modern browser. There's no build step, no package manager, nothing to install. It's pure HTML + CSS + JS.

### Running locally

Double-click `index.html` and it opens in your browser. That's it.

### Hosting on GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages** in your repo
3. Set source to your `main` branch, root folder
4. Done — your site will be live at `https://<your-username>.github.io/<repo-name>/`

## How it works

ULTRARCHIVE uses `no-cors` fetch requests to silently ping the save endpoint of each archive service in the background. The archives receive the submission request and process it on their end, while your browser never actually has to open a tab.

For coverage checking, the tool queries the Wayback Machine's public availability API. Your archive history is saved to your browser's `localStorage` — meaning it's per-device, fully private, and requires no account.

## Known limitations

- Services requiring login (Perma.cc, Archive-It, UK Web Archive) need you to be logged into their site in the same browser for submissions to succeed
- Some services may rate-limit or time out during heavy use
- Coverage checking is primarily powered by Wayback's API; other services' archive status is inferred from your local submission history
- Local history is per-browser and is not synced between devices

## Tech

- Plain HTML / CSS / JavaScript
- No frameworks, no build tools, no dependencies
- Fonts: Syne + Space Mono (via Google Fonts)

## Roadmap

- [ ] Live Wayback Machine status checker for individual submissions
- [ ] "Copy all archive links" export button
- [ ] YouTube auto-detect → route to video archives only
- [ ] Batch archiving from a pasted list of URLs
- [ ] Import/export history as JSON

## Contributing

This is an independent project. Feel free to fork, tweak, and submit ideas.

## License

MIT — do whatever you want with it, just don't blame me if Wayback Machine blocks your IP for spamming.
