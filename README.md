# WiiM Controller Plugin for Stream Deck

Control your [WiiM](https://wiimhome.com) audio player directly from your Elgato Stream Deck.

## Features

- **Play / Pause** — toggle playback
- **Next / Previous Track** — skip tracks
- **Volume Up / Down** — adjustable step size (1–20%)
- **Mute / Unmute** — toggle audio mute
- **Now Playing** — displays album art, artist, track title, and streaming service (Tidal, Spotify, Plex, etc.)
- **Input Cycle** — cycle through configured inputs (WiFi, Bluetooth, Line In, Optical, HDMI, USB) with dynamic icons
- **Preset** — trigger WiiM presets (1–12) to launch your favorite services and playlists (Tidal, Spotify, Plex, radio, etc.)
- **Output Cycle** — cycle through audio outputs (Optical/SPDIF, Line Out, Coaxial) with dynamic icons

## Requirements

- Elgato Stream Deck software **6.4+** (Node.js plugin support)
- A WiiM device on your local network (WiiM Mini, Pro, Pro Plus, Ultra, Amp, etc.)

## Installation

1. Download the latest `com.wiim.streamdeck.streamDeckPlugin` from [Releases](../../releases/latest)
2. Double-click the file to install
3. In the Stream Deck app, find **Wiim Controller** in the action list
4. Drag an action to your deck
5. In the Property Inspector, enter your WiiM device's IP address and click **Test Connection**

### Setting up Presets

Presets are configured in the **WiiM Home** app, not in the Stream Deck plugin. To set up a preset:

1. Open the **WiiM Home** app and start playing from your desired service (Tidal, Spotify, etc.)
2. Tap the playback screen → three-dot menu → **Add to Preset**
3. Choose a preset slot (1–12)
4. In Stream Deck, drag the **Preset** action to your deck and select the preset number in the Property Inspector

You can also add radio stations, local playlists, or any other supported source as a preset.

### Finding your WiiM IP

Open the **WiiM Home** app → tap your device → Settings → Device Information → copy the IP address.

## Localization

The plugin automatically uses your OS language:
- **English** (default)
- **Spanish** (Español)

## How it works

The plugin communicates with your WiiM device over:
- **HTTPS** (LinkPlay API) — for playback control, volume, mute, input switching, presets, and device status polling
- **UPnP/SOAP** (port 49152) — for album art retrieval from track metadata

Status is polled every 3 seconds when any action is active on the deck.

## Building from source

```bash
cd com.wiim.streamdeck.sdPlugin
npm install --production
cd ..
zip -r com.wiim.streamdeck.streamDeckPlugin com.wiim.streamdeck.sdPlugin/ -x "*.DS_Store"
```

Double-click the resulting `.streamDeckPlugin` file to install.

## Releases

Releases are automated via GitHub Actions. Every push to `main` triggers a new release:

- **Patch** bump (default) — any regular commit
- **Minor** bump — include `(MINOR)` in the commit message
- **Major** bump — include `(MAJOR)` in the commit message

The workflow automatically stamps the version in all plugin files, commits it back to the repo, tags, builds, and publishes a GitHub Release with the `.streamDeckPlugin` artifact attached.

## License

[MIT](LICENSE)
